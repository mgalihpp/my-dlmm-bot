# Vexis web dashboard

This directory contains the React Router application used by the Vexis dashboard. The dashboard uses React, TypeScript, Tailwind CSS, and local shadcn/ui components.

## Development

Run these commands from the repository root:

```bash
npm run dev
npm run build
npm run start
```

To work on the dashboard package directly:

```bash
npm run dev --prefix src/web-react
npm run typecheck --prefix src/web-react
npm run format --prefix src/web-react
```

The root application starts the dashboard server and reads its port and password from `vexis.config.json`. The dashboard requires the server-side config and session environment used by the root application.

## Structure

- `app/routes/` contains dashboard, settings, API, and authentication routes.
- `app/components/` contains shared UI components.
- `app/lib/server/` contains server-only data access and session helpers.
- `app/lib/` contains client-safe utilities.

Do not put private keys in browser code. On-chain actions, where enabled by the server, must remain server-side.
