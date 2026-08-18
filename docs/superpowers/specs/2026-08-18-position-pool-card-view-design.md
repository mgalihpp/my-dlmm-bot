# Position and Pool Card View Design

## Goal

Add a responsive card presentation matching the provided reference while keeping
the existing table presentation available for open positions, closed positions,
and the pool results table.

## Behavior

- Desktop defaults to `Table`.
- Mobile defaults to `Card`.
- A `Table / Card` switcher is shown for each of the three data sections.
- The selected view is persisted in `localStorage` and restored on later visits.
- Switching views changes presentation only; filtering, sorting, expansion,
  pagination, links, currency formatting, and pool detail behavior remain the
  same.
- Card mode is the primary compact mobile presentation. Table mode remains
  horizontally scrollable on narrow screens.

## Scope

The change is limited to the web React view layer:

- Add one shared view-switcher component using existing toggle primitives.
- Add card renderers for open positions, closed positions, and screened pools.
- Keep existing table renderers and their data logic.
- Reuse existing formatting utilities, badges, icons, range visuals, and links.
- Do not change loaders, APIs, domain types, or persisted runtime state.

## Visual Direction

Cards use the reference's dark, dense portfolio treatment:

- Rounded bordered surface with restrained contrast.
- Header row containing token/pool identity and status badge.
- Small muted labels with bright tabular values in compact metric columns.
- Range visuals use the existing range data and a simple horizontal track.
- Negative PnL remains destructive/red; in-range status remains neutral/positive.
- Existing Geist typography and theme variables remain the source of truth.

Open position cards show pair, shortened address, range status, balance, fees,
PnL USD, and range visual. Closed cards show pair, closure time, deposits,
withdrawals, fees, and both PnL values. Pool cards show pool identity, price,
market cap, TVL, volume, fee, risk/status badges, and trend information. The
most useful fields appear first on mobile; the table remains the complete dense
view.

## Performance and Accessibility

- Render only the active presentation; do not hide a duplicate table/card DOM
  tree with CSS.
- Keep filtering and sorting in the current `useMemo` paths and pass the same
  filtered rows to the active renderer.
- Avoid new dependencies and avoid per-row callback memoization unless profiling
  shows a need.
- Use stable keys based on existing pool/position addresses.
- Preserve keyboard-operable controls, visible focus states, semantic links,
  and accessible labels for the view switcher and status indicators.
- Use existing image error handling and do not add eager image fetching.

## Testing

- Add focused tests for the view preference/default behavior if the preference
  logic is extracted into a pure helper.
- Keep existing data and formatting tests unchanged unless the card renderers
  expose a testable regression.
- Run `npm run check`, `npm run typecheck`, and `npm test`.

## Out of Scope

- Replacing desktop tables permanently.
- Virtualized lists, pagination changes, API changes, or a new design system.
- Redesigning dashboard navigation, charts, or unrelated settings pages.
