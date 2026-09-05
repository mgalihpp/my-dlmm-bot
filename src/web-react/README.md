# Vexis web dashboard

This directory contains the React Router application used by the Vexis dashboard. The dashboard uses React, TypeScript, Tailwind CSS, and local shadcn/ui components.

## Development

Run these commands from the repository root:

```bash
bun run dev
bun run build
bun run start
```

To work on the dashboard package directly:

```bash
bun run --filter web-react dev
bun run --filter web-react typecheck
bun run --filter web-react format
```

The root application starts the dashboard server and reads its port and password from `vexis.config.json`. The dashboard requires the server-side config and session environment used by the root application.

## Structure

- `app/routes/` contains dashboard, settings, API, and authentication routes.
- `app/components/` contains shared UI components.
- `app/lib/server/` contains server-only data access and session helpers.
- `app/lib/` contains client-safe utilities.

Do not put private keys in browser code. The dashboard keeps on-chain actions server-side; authenticated users can close positions from the portfolio page.
