# Production image for Cloud Run (WI-017). Node 24, the same major as CI.
# The server runs from source through tsx and imports app/ and server/ via the tsconfig
# paths, so the runtime stage keeps the source tree next to build/ and node_modules/.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
# Migrations, then the app. Who may sign in is the staff Google group (WI-019), not a seed.
CMD ["sh", "-c", "npm run db:migrate && exec npm start"]
