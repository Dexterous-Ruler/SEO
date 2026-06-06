# Sentinel — single-service image: the Node server serves BOTH the web console
# (web/) and the API (backend-api/). Runtime needs only `dotenv`; all the heavy
# CLI deps (sharp, lighthouse, chrome) are NOT in the server's import graph, so
# we strip them for a tiny, fast image.
FROM node:20-slim

WORKDIR /app

# Install the runtime deps only: dotenv + sharp (image→WebP compression).
# sharp ships prebuilt linux-x64 binaries, so no native build is needed.
# lighthouse/chrome/chalk/etc. are CLI-only and excluded → small, fast image.
COPY package.json ./
RUN npm pkg delete dependencies devDependencies scripts \
 && npm install dotenv@^16.4.5 sharp@^0.33.5 --no-audit --no-fund --omit=dev

# App code (server + shared engine libs + static console).
COPY backend-api ./backend-api
COPY src ./src
COPY web ./web

ENV NODE_ENV=production
# Koyeb injects PORT; the server reads process.env.PORT. 8000 is the platform default.
ENV PORT=8000
EXPOSE 8000

# Lightweight container healthcheck hitting the server's /health route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend-api/server.js"]
