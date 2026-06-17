FROM node:20-alpine

WORKDIR /usr/app

COPY package.json .

RUN yarn --quiet

COPY . .

RUN yarn global add pm2

RUN yarn build
RUN yarn test:announcements

CMD ["pm2-runtime", "dist/app.js"]
