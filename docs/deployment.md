# Deployment

## VPS with pm2

Install Node.js 20 or newer and pm2 on the server. Copy `vexis.config.json` to the server through a secure channel, then run:

```bash
npm ci
npm run build
pm2 start npm --name vexis -- start
pm2 save
pm2 startup
```

The `start` script runs the compiled React dashboard and the shared bot runtime. Set the dashboard port in `web.port`, or provide the port expected by the hosting environment. After a release, run:

```bash
npm ci
npm run build
pm2 restart vexis
```

## Docker

Create a `Dockerfile` in the repository root:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
COPY src/web-react/package*.json ./src/web-react/
RUN npm ci && npm ci --prefix src/web-react
COPY . .
RUN npm run build
CMD ["npm", "start"]
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
