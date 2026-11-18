# ---- build: install deps and emit the Nitro Node server in .output/ ----
FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- runtime: just the built server, run as the unprivileged node user ----
FROM node:22-alpine
WORKDIR /app

# Hosts (Render included) inject their own PORT; 3000 is only the local default.
ENV NODE_ENV=production \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
CMD ["node", ".output/server/index.mjs"]
