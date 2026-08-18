# Responsive Sheet Side Design

Use the existing `useIsMobile` hook to make portfolio and pool detail sheets
open from the bottom on mobile and from the right on desktop.

- Apply `side={isMobile ? "bottom" : "right"}` to open-position,
  closed-position, and pool detail sheets.
- Keep existing sheet state, detail content, focus handling, and close behavior.
- Do not add dependencies or change APIs.
- Verify with `npm run check`, `npm run typecheck`, `npm test`, and
  `npm run web:build`.
