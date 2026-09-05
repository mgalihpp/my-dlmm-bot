# Deployment

## VPS with pm2

Install Bun 1.4 or newer and pm2 on the server. Copy `vexis.config.json` to the server through a secure channel, then run:

```bash
bun install --frozen-lockfile
bun run build
pm2 start bun --name vexis -- run start
pm2 save
pm2 startup
```

The `start` script runs the compiled React dashboard and the shared bot runtime. Set the dashboard port in `web.port`, or provide the port expected by the hosting environment. After a release, run:

```bash
bun install --frozen-lockfile
bun run build
pm2 restart vexis
```

## Docker

Create a `Dockerfile` in the repository root:

```dockerfile
FROM oven/bun:1.4.1-alpine
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY src/web-react/package.json ./src/web-react/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
CMD ["bun", "run", "start"]
```

Build and run it with the local config mounted read-only:

```bash
docker build -t vexis .
docker run -d --restart unless-stopped \
  --name vexis \
  -p 8080:8080 \
  -v "$(pwd)/vexis.config.json:/app/vexis.config.json:ro" \
  vexis
```

Use a secret manager for private keys, Telegram tokens, and LLM API keys where the hosting platform provides one. Do not bake `vexis.config.json` into the image.
