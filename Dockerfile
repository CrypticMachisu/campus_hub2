FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

# The browser calls /api on the same origin; nginx proxies it to the API
# container. Override VITE_API_URL only if the API lives on another origin.
ARG VITE_API_URL=/api
ARG VITE_API_KEY=
ARG VITE_CROSS_UNIVERSITY_ENABLED=false
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_KEY=$VITE_API_KEY
ENV VITE_CROSS_UNIVERSITY_ENABLED=$VITE_CROSS_UNIVERSITY_ENABLED

RUN npm run build

# Crawler-facing HTML gateway. It reads the same built index.html and asks the
# API for the public record behind a club, event, commitment or post, so social
# scrapers receive route-specific head tags before React runs.
FROM node:22-bookworm-slim AS prerender

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY deploy/prerender-server.js ./deploy/prerender-server.js
COPY deploy/start-prerender.js ./deploy/start-prerender.js

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "deploy/start-prerender.js"]

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
