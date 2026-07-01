### Create a context

Adapt `.ssh/authorized_keys` on the remote host when working with keys

```
docker context create dev-chat-endpoint --docker "host=ssh://ec2-user@*********.compute.amazonaws.com"
```

### Certbot + NGINX on AWS Linux 2023

```
sudo dnf install -y certbot python3-certbot-dns-route53
sudo dnf install -y nginx
sudo dnf install -y python3-certbot-apache
sudo dnf install -y python3-certbot-nginx
sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer
sudo systemctl enable --now nginx
```

### Protected public chat edge

Repo-owned runtime surface:

- `PORT` / `8402`: Express HTTP API under `/api/chat`.
- `PORT_WS_AUTH` / `8400`: authenticated chat WebSocket at `/`.
- `PORT_WS_VIEW` / `8401`: anonymous viewer WebSocket at `/`.
- Public hostnames: `chat-api.degencoinflip.com`, `chat.degenrpc.com`, and `chatview-api.degencoinflip.com`.
- Public HTTP paths: `GET /api/chat/viewers`, `GET /api/chat/get_history`, `GET /api/chat/get_history_all`, `GET /api/chat/get_banned_wallets`, `POST /api/chat/report`, `POST /api/chat/send_announcement`, and `POST /api/chat/request_tip_announcement`.

Production public traffic should enter through the WAF/edge first, then origin NGINX, then Node. Use `ops/nginx/dcf-chat-svc.conf.template` for the origin NGINX layer. It denies requests whose source address is not in `/etc/nginx/conf.d/dcf-chat-trusted-edge-geo.conf`, applies a dedicated `/api/chat/viewers` limit zone, preserves WebSocket upgrades, and injects `X-DCF-Edge-Secret` only after the trusted-edge source check passes.

In `EDGE_PROTECTION_MODE=enforce`, Node rejects unauthenticated HTTP/WebSocket requests on these listeners regardless of the client-supplied `Host`. The NGINX limiter uses `CF-Connecting-IP` only when the trusted edge overwrites it; otherwise it falls back to the trusted edge hop instead of trusting client-supplied `X-Forwarded-For`.

Required app environment for protected production:

```
EDGE_PROTECTION_MODE=enforce
TRUSTED_EDGE_HEADER=x-dcf-edge-secret
TRUSTED_EDGE_SECRET=<same value rendered into DCF_CHAT_EDGE_SECRET for nginx>
PUBLIC_CHAT_HOSTS=chat-api.degencoinflip.com,chat.degenrpc.com,chatview-api.degencoinflip.com
CHAT_VIEWERS_RATE_PER_SECOND=2
CHAT_VIEWERS_RATE_BURST=20
CHAT_HISTORY_ALL_RATE_PER_SECOND=1
CHAT_HISTORY_ALL_RATE_BURST=10
TRUST_PROXY=loopback
```

Render and validate the NGINX config:

```
sudo install -m 0644 /dev/null /etc/nginx/conf.d/dcf-chat-trusted-edge-geo.conf
# Fill dcf-chat-trusted-edge-geo.conf with trusted WAF/edge CIDRs in nginx geo format:
# 203.0.113.0/24 1;

DCF_CHAT_EDGE_SECRET='<shared secret>' \
  envsubst '$DCF_CHAT_EDGE_SECRET' \
  < ops/nginx/dcf-chat-svc.conf.template \
  | sudo tee /etc/nginx/conf.d/dcf-chat-svc.conf >/dev/null

sudo nginx -t
sudo systemctl reload nginx
```

`/api/chat/viewers` is limited twice: at NGINX with `chat_api_viewers` (`2r/s`, `burst=20`) and in the Node route middleware with `CHAT_VIEWERS_RATE_PER_SECOND` / `CHAT_VIEWERS_RATE_BURST`. `/api/chat/get_history_all` gets the same two-layer treatment with `chat_api_history_all` (`1r/s`, `burst=10`) and `CHAT_HISTORY_ALL_RATE_PER_SECOND` / `CHAT_HISTORY_ALL_RATE_BURST`. The app logs one sanitized request event per HTTP request plus explicit edge-deny and route-rate-limit events. The request logs intentionally do not include `Authorization`, `internal-key`, `sec-websocket-protocol`, cookies, request bodies, or query strings.

Smoke verification after DNS/WAF cutover:

```
dig +short chat-api.degencoinflip.com
curl -I https://chat-api.degencoinflip.com/api/chat/viewers
curl -I https://chat.degenrpc.com/api/chat/viewers
curl -I https://chat-api.degencoinflip.com/api/chat/get_history_all

curl -I --resolve chat-api.degencoinflip.com:443:<old-origin-ip> https://chat-api.degencoinflip.com/api/chat/viewers
curl -I --resolve chat.degenrpc.com:443:<old-origin-ip> https://chat.degenrpc.com/api/chat/viewers
curl -I --resolve chat-api.degencoinflip.com:443:<old-origin-ip> https://chat-api.degencoinflip.com/api/chat/get_history_all
```

The direct-origin `--resolve` checks should return deny/timeout/403 instead of normal app data. Do not run a production load test; validate the path-specific limit with local or staging traffic only.

### Legacy NGINX config

The following older config is retained for historical context. Use the protected template above for public production traffic.

Increase worker connections!

```
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;

# Load dynamic modules. See /usr/share/doc/nginx/README.dynamic.
include /usr/share/nginx/modules/*.conf;

events {
    worker_connections 32000;
}

http {
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile            on;
    tcp_nopush          on;
    keepalive_timeout   65;
    types_hash_max_size 4096;

    include             /etc/nginx/mime.types;
    default_type        application/octet-stream;

    # Load modular configuration files from the /etc/nginx/conf.d directory.
    # See http://nginx.org/en/docs/ngx_core_module.html#include
    # for more information.
    include /etc/nginx/conf.d/*.conf;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    server {
        listen       80;
        listen       [::]:80;
        server_name  _;
        root         /usr/share/nginx/html;

        # Load configuration files for the default server block.
        include /etc/nginx/default.d/*.conf;

        error_page 404 /404.html;
        location = /404.html {
        }

        error_page 500 502 503 504 /50x.html;
        location = /50x.html {
        }
    }

    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=myaddr:10m;

    upstream chatwebsocket {
        server 127.0.0.1:8400;
    }

    upstream chatwebsocketviewer {
        server 127.0.0.1:8401;
    }

    upstream chatapi {
        server 127.0.0.1:8402;
    }

    server {
        server_name chat-api.degencoinflip.com;
        listen 443 ssl;
        location / {
            limit_conn myaddr 5;
            limit_req zone=mylimit burst=5;
            proxy_pass http://chatwebsocket;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
        }

        location /api/chat {
                limit_conn myaddr 5;
                limit_req zone=mylimit burst=5;
                proxy_pass http://chatapi;
        }

        ssl_certificate /etc/letsencrypt/live/chat-api.degencoinflip.com/fullchain.pem; # managed by Certbot
        ssl_certificate_key /etc/letsencrypt/live/chat-api.degencoinflip.com/privkey.pem; # managed by Certbot
    }

    server {
        server_name chatview-api.degencoinflip.com;
        listen 443 ssl;
        location / {
            limit_conn myaddr 5;
            limit_req zone=mylimit burst=5;
            proxy_pass http://chatwebsocketviewer;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
        }

        location /api/chat {
                limit_conn myaddr 5;
                limit_req zone=mylimit burst=5;
                proxy_pass http://chatapi;
        }

        ssl_certificate /etc/letsencrypt/live/chatview-api.degencoinflip.com/fullchain.pem; # managed by Certbot
        ssl_certificate_key /etc/letsencrypt/live/chatview-api.degencoinflip.com/privkey.pem; # managed by Certbot
    }
}

```

### Tune server

```
sysctl -w fs.file-max=12000500
sysctl -w fs.nr_open=20000500
ulimit -n 20000000
sysctl -w net.ipv4.tcp_mem='10000000 10000000 10000000'
sysctl -w net.ipv4.tcp_rmem='1024 4096 16384'
sysctl -w net.ipv4.tcp_wmem='1024 4096 16384'
sysctl -w net.core.rmem_max=16384
sysctl -w net.core.wmem_max=16384
```

### Axiom filter

```
declare query_parameters (wallet_filter:string = "");
dcf_crash
| where hostname contains "ip-172-31-12-138.us-east-2.compute.internal"
| where isempty(wallet_filter) or msg contains wallet_filter
| where msg !contains "[STATS]"
| where msg !contains "Fetched game"
| sort by _time desc
```
