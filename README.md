### Create a context

```
docker context create dev-chat-endpoint --docker "host=ssh://ec2-user@*********.compute.amazonaws.com"
```

### Certbot on AWS Linux 2023

```
sudo dnf install -y certbot python3-certbot-dns-route53
sudo dnf install -y python3-certbot-apache
sudo dnf install -y python3-certbot-nginx
sudo systecmtl daemon-reload
sudo systemctl enable --now certbot-renew.timer
```

### NGINX config

Increase worker connections!

```
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=myaddr:10m;

    upstream websocket {
        server 127.0.0.1:8100;
    }

    upstream api {
        server 127.0.0.1:8200;
    }


    server {
        server_name crash.degenrpc.com;
        listen 443 ssl;
        location / {
            limit_conn myaddr 3;
            limit_req zone=mylimit burst=5;
            proxy_pass http://websocket;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
        }

        location /api/status {
                limit_conn myaddr 3;
                limit_req zone=mylimit burst=5;
                proxy_pass http://api;
        }

        ssl_certificate /etc/letsencrypt/live/crash.degenrpc.com/fullchain.pem; # managed by Certbot
        ssl_certificate_key /etc/letsencrypt/live/crash.degenrpc.com/privkey.pem; # managed by Certbot
        include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
    }

    server {
        server_name crashview.degenrpc.com;
        listen 443 ssl;
        location / {
            limit_conn myaddr 3;
            limit_req zone=mylimit burst=5;
            proxy_pass http://websocketviewer;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
        }

        location /api/status {
                limit_conn myaddr 3;
                limit_req zone=mylimit burst=5;
                proxy_pass http://api;
        }

        include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
        ssl_certificate /etc/letsencrypt/live/crashview.degenrpc.com/fullchain.pem; # managed by Certbot
        ssl_certificate_key /etc/letsencrypt/live/crashview.degenrpc.com/privkey.pem; # managed by Certbot

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
