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

### NGINX config

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

### Axiom logging configuration

The logger writes local pretty logs by default. Axiom forwarding is enabled only
when `AXIOM_ORG_ID`, `AXIOM_TOKEN`, and `AXIOM_DATASET` are all configured in the
runtime environment or secret manager. Leave them unset for local and test runs.

```
declare query_parameters (wallet_filter:string = "");
dcf_crash
| where hostname contains "ip-172-31-12-138.us-east-2.compute.internal"
| where isempty(wallet_filter) or msg contains wallet_filter
| where msg !contains "[STATS]"
| where msg !contains "Fetched game"
| sort by _time desc
```
