# ---- build: install deps and emit the Nitro Node server in .output/ ----
FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- runtime: serve the built app with runtime-injected public config ----
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

# Vite variables are normally compiled at build time. This app also supports
# runtime injection so Render Docker services can use dashboard env vars safely.
USER node
CMD ["sh", "-c", "node -e 'const fs=require(\"fs\"); const config={supabaseUrl:process.env.VITE_SUPABASE_URL||\"\",supabaseAnonKey:process.env.VITE_SUPABASE_ANON_KEY||\"\"}; fs.writeFileSync(\".output/public/runtime-config.js\", \"window.__MESTRE_INTERIOR_CONFIG__ = \"+JSON.stringify(config)+\";\\n\");' && exec node .output/server/index.mjs"]
