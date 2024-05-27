#!/bin/bash
eval `ssh-agent -s`
ssh-add ~/.ssh/docker_rsa
docker context use dev-crash-endpoint
docker stop chat-app
docker rm chat-app
docker build . -t chat-app
docker run \
    -d \
    --env-file .env.dev \
    --restart=on-failure \
    -v /home/ec2-user/chat.log:/usr/app/app.log \
    --name chat-app \
    --network host \
    docker.io/library/chat-app