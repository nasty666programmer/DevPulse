# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app

# VITE_-prefixed vars are inlined into the JS bundle at build time (Vite),
# not read at container runtime — a k8s Secret/ConfigMap change alone does
# nothing here. Pass the real value via --build-arg when building the image.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
# Fail loudly here instead of shipping a bundle where Google sign-in is
# silently broken — an empty/missing build-arg would otherwise still exit 0.
RUN test -n "$VITE_GOOGLE_CLIENT_ID" || (echo "ERROR: VITE_GOOGLE_CLIENT_ID build-arg is empty. Pass --build-arg VITE_GOOGLE_CLIENT_ID=... (docker build) or set the VITE_GOOGLE_CLIENT_ID repository variable (GitHub Actions: Settings > Secrets and variables > Actions > Variables)." >&2 && exit 1)

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
