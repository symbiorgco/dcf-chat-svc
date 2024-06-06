#!/bin/bash
eval `ssh-agent -s`
ssh-add ~/.ssh/docker_rsa
#docker context use dev-crash-endpoint
docker context use prod-chat-endpoint
docker stop chat-app
docker rm chat-app
docker build . -t chat-app
docker run \
    -d \
    --env-file .env.prod \
    --restart=on-failure \
    -v /home/ec2-user/chat.log:/usr/app/app.log \
    -v /home/ec2-user/chat-history.json:/usr/app/chat-history.json \
    --name chat-app \
    --network host \
    docker.io/library/chat-app