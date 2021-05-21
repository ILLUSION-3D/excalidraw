FROM node:14-alpine AS build

WORKDIR /opt/node_app

COPY package.json yarn.lock ./
RUN yarn --ignore-optional

ARG NODE_ENV=production

COPY . .
RUN yarn build:app:docker

FROM nginx:stable-alpine

COPY --from=build /opt/node_app/build /usr/share/nginx/html
COPY default.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK CMD wget -q -O /dev/null http://localhost:8080 || exit 1
