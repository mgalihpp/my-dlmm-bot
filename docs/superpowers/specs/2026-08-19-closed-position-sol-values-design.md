# Closed Position SOL Values

Closed-position amounts must use the historical SOL values returned by the
position PnL endpoint instead of converting USD amounts with the live open
portfolio SOL price. Closed UI data must remain independent of open portfolio
price changes.

The detail loader will preserve the endpoint `solPrice` only as a compatibility
fallback, while the detail component will pass `total.sol` for deposits,
withdrawals, and fees. Closed aggregate cards will accept optional SOL totals
from the API and will not recalculate them from a live price.

Tests will cover historical SOL formatting and the no-live-price path.
