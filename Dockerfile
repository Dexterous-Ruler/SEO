# Sentinel — single-service image: the Node server serves BOTH the web console
# (web/) and the API (backend-api/). Runtime needs only `dotenv` + `sharp`; all
# the heavy CLI deps (lighthouse, chrome, chalk) are NOT in the server's import
# graph, so we strip them for a tiny, fast image.

# ---- Stage 1: precompile the web console (JSX → minified+gzipped JS) ----
# Eliminates the ~3MB in-browser Babel + client-side transform on every load,
# and ships React's production build. Output → web/dist (served in prod).
FROM node:20-slim AS webbuild
WORKDIR /build
COPY web ./web
RUN npm install --no-save --no-audit --no-fund esbuild@^0.21.5 \
 && node web/build.mjs

# ---- Stage 2: runtime ----
FROM node:20-slim
WORKDIR /app

# Install the runtime deps only: dotenv + sharp (image→WebP compression).
# sharp ships prebuilt linux-x64 binaries, so no native build is needed.
COPY package.json ./
RUN npm pkg delete dependencies devDependencies scripts \
 && npm install dotenv@^16.4.5 sharp@^0.33.5 --no-audit --no-fund --omit=dev

# App code (server + shared engine libs). The web console comes from the build
# stage and already includes web/dist (the optimized bundle the server prefers).
COPY backend-api ./backend-api
COPY src ./src
# Canonical mu-plugin — read at runtime by /push-mu-update to self-update sites.
COPY wp-plugin ./wp-plugin
COPY --from=webbuild /build/web ./web

ENV NODE_ENV=production
# Koyeb injects PORT; the server reads process.env.PORT. 8000 is the platform default.
ENV PORT=8000
EXPOSE 8000

# Lightweight container healthcheck hitting the server's /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend-api/server.js"]
