# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

# Same image doubles as the rss-collect CronJob entrypoint:
#   command: ["node", "dist/bin/collect.js"]
CMD ["node", "dist/src/index.js"]
