FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first so code edits do not invalidate the
# expensive layer. `npm ci` honours server/package-lock.json exactly.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
