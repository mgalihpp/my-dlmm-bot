# Portfolio Card Details Sheet Design

## Goal

Make `Details` in portfolio card mode open a right-side sheet instead of
rendering detail content inline.

## Behavior

- Open-position card details open a sheet containing the existing
  `PositionsDetail` content.
- Closed-position card details open a sheet containing the existing
  `ClosedDetail` content.
- The sheet shows the selected pair and address in its header.
- The sheet closes through its close button, overlay, or Escape.
- Table mode keeps the current inline row expansion unchanged.
- Only the selected card's detail content is mounted.

## Implementation

- Reuse the existing shadcn `Sheet` primitives and the current detail
  components; do not duplicate detail fetching or formatting logic.
- Replace card-local `expanded` rendering with a selected detail item state.
- Keep the existing card `Details` button as the trigger.
- Render the sheet alongside each portfolio section so open and closed details
  have independent state and do not affect one another.

## Performance and Accessibility

- Do not mount hidden detail sheets for every card.
- Preserve the existing lazy fetch behavior in `ClosedDetail` by mounting it
  only when its sheet is open.
- Use `SheetTitle` and `SheetDescription` for an accessible dialog label.
- Keep the trigger keyboard-operable and rely on the existing sheet focus trap,
  Escape handling, and close button.

## Testing

- Run `npm run check`, `npm run typecheck`, and `npm test`.
- Run `npm run web:build` to verify the sheet integration in client and SSR
  builds.
