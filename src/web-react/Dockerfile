# Build from the repository root: docker build -f src/web-react/Dockerfile .
FROM oven/bun:1.4.1-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN bun install

FROM oven/bun:1.4.1-alpine AS production-dependencies-env
COPY ./package.json ./bun.lock ./bunfig.toml /app/
COPY ./src/web-react/package.json /app/src/web-react/
WORKDIR /app
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.1-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app/src/web-react
RUN bun run build

FROM oven/bun:1.4.1-alpine
COPY ./package.json ./bun.lock ./bunfig.toml /app/
COPY ./src/web-react/package.json /app/src/web-react/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/src/web-react/build /app/src/web-react/build
WORKDIR /app/src/web-react
CMD ["bun", "run", "start"]
