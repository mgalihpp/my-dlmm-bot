# Settings Page Redesign

## Goal

Make `/settings` easier to scan and edit by presenting the bot's operational state and configuration as a purposeful card-based dashboard, without changing its server actions or persisted config format.

## Design

- Keep the existing `DashboardShell`, loader/action flow, inline field editors, and secret handling.
- Replace the current vertical tabs with a responsive overview row of section cards. Each card exposes the section name, a short description, and the number of available controls; clicking it selects that section.
- Make the agent status card the visual anchor with a clear running/stopped state, last-cycle metadata, and the existing start/stop action.
- Render the selected section in a focused card below the overview. Preferences remains a separate card because it is client-only.
- Use the existing Geist typography and shadcn tokens, with a restrained indigo/cyan accent treatment for operational status. Avoid new dependencies and global theme changes.
- Preserve keyboard focus, readable contrast, one-column mobile layout, and reduced-motion behavior.

## Data Flow

The route continues to load `SettingsPayload`. The page chooses the latest successful action payload, updates local section selection only in the browser, and submits edits through the existing `useSubmit` forms. No config schema or API changes are required.

## Verification

- Existing settings unit tests remain unchanged.
- Run web typecheck and root checks/tests.
- Manually inspect `/settings` at desktop and mobile widths, including section selection, inline save feedback, agent toggle, and error state.
