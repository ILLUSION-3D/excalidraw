FROM node:14-alpine AS build

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npm run build:app

FROM nginx:stable-alpine

COPY --from=build /usr/src/app/build /usr/share/nginx/html
COPY default.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK CMD wget -q -O /dev/null http://localhost:8080 || exit 1
