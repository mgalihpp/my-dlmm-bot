# Currency Icons Design

## Goal

Replace visible `USD` and `SOL` labels in the web React UI with the provided
USDC and Solana logo images while keeping currency selection and data formats
unchanged.

## Scope

- Use `src/web-react/public/usd-coin-usdc-logo.png` for USD.
- Use `src/web-react/public/Solana_logo.png` for SOL.
- Update currency tabs and PnL table headers across Portfolio and Pool Radar.
- Keep accessible labels containing `USD` and `SOL` through `aria-label` or
  visually hidden text.
- Do not change backend values, query parameters, formatting, or currency
  calculation logic.

## Implementation

Add one small reusable web component that maps a currency to its image,
alternative text, and accessible label. Use it in the existing currency tabs
and in table headings that currently contain `USD` or `SOL`. Images should be
decorative where the adjacent visually hidden label carries the meaning, and
should use a consistent small size with `object-contain`.

## Verification

Run the web typecheck/build and the existing test suite. Confirm no visible
currency text remains in the targeted tab and PnL header labels, while the
controls remain distinguishable to screen readers.
