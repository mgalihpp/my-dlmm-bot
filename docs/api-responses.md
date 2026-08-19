# API Responses

This document describes the response shapes consumed by the services in this
repository. The schemas under `src/domain/` and the service implementations are
the source of truth for decoded fields. The document also records selected live
API observations; those observations describe one test environment and are not
guarantees about future API responses.

## Conventions

- **Decoded** means that the repository validates and uses the field.
- **Optional** means that the repository schema does not require the field.
- **Nullable** means that the schema accepts `null`.
- Fields returned by an API but absent from an Effect schema are ignored by the
  decoder. They are listed only when they are relevant to a recorded live
  observation.
- Source references use paths relative to the repository root.

## API Summary

| API | Base URL | Service | Endpoints used |
|---|---|---|---|
| Meteora DLMM data | `https://dlmm.datapi.meteora.ag` or `https://dlmm.dev.metdev.io` when `dev` is enabled | `src/services/MeteoraApi.ts` | `/portfolio/total`, `/portfolio/open`, `/portfolio`, `/pools`, `/pools/{address}`, `/positions/{poolAddress}/pnl`, `/pools/{address}/historical-volume`, `/pools/{address}/ohlcv` |
| Meteora pool discovery | `https://pool-discovery-api.datapi.meteora.ag` | `src/services/MeteoraApi.ts` | `/pools` |
| RugCheck | `https://api.rugcheck.xyz` | `src/services/RugCheck.ts` | `/v1/tokens/{mint}/report/summary` |
| Jupiter swap | `https://api.jup.ag` | `src/services/Zap.ts` | `/swap/v2/order`, `/swap/v2/execute` |
| Jupiter token list | `https://token.jup.ag` | `src/services/TokenMeta.ts` | `/strict` |
| Solana RPC and Meteora DLMM SDK | configured `rpcUrl` | `src/services/Solana.ts`, `src/services/Dlmm.ts`, `src/services/Zap.ts` | SDK and RPC operations, not HTTP response schemas |

Meteora, RugCheck, and Jupiter HTTP clients send
`accept: application/json`. Meteora and RugCheck retry transient failures with
an exponential 400 ms schedule and up to two recurrences. Jupiter retries
transient failures with an 800 ms spaced schedule and up to three recurrences;
its swap logic also retries selected slippage failures using a slippage ladder.

## 1. Meteora DLMM Data API

The base URL is selected in `src/services/MeteoraApi.ts:36-38` and
`src/services/MeteoraApi.ts:116-120`.

### `GET /portfolio/total`

- Service method: `totalPnl` (`src/services/MeteoraApi.ts:206-207`).
- Query: `user`.
- Schema: `PortfolioTotal` (`src/domain/portfolio.ts:3-9`).

| Field | Type | Status |
|---|---|---|
| `totalPnlUsd` | string | Decoded |
| `totalPnlSol` | string | Decoded |
| `totalPnlPctChange` | string | Decoded |
| `totalPnlSolPctChange` | string | Decoded |

**Live observation from 2026-08-08:** one response also contained
`totalClosedPositions` as a number. It is not part of `PortfolioTotal` and is
not decoded.

### `GET /portfolio/open`

- Service method: `openPortfolio` (`src/services/MeteoraApi.ts:208-214`).
- Query: `user`, `page` (default `1`), and `page_size` (default `50`).
- Schema: `OpenPortfolioResponse` (`src/domain/portfolio.ts:83-95`).

| Field | Type | Status |
|---|---|---|
| `hasNext` | boolean | Decoded |
| `page` | number | Decoded |
| `pageSize` | number | Decoded |
| `totalCount` | number | Decoded |
| `totalPositions` | number | Decoded |
| `solPrice` | string or null | Optional, decoded |
| `total` | `OpenPortfolioTotals` or null | Optional, decoded |
| `pools` | `OpenPool[]` | Decoded |

`OpenPortfolioTotals` (`src/domain/portfolio.ts:11-24`):

| Field | Type | Status |
|---|---|---|
| `totalPositions` | number | Decoded |
| `balances` | string | Decoded |
| `balancesSol` | string or null | Decoded |
| `unclaimedFees` | string | Decoded |
| `unclaimedFeesSol` | string or null | Decoded |
| `pnl` | string | Decoded |
| `pnlPctChange` | string | Decoded |
| `pnlSol` | string or null | Decoded |
| `pnlSolPctChange` | string or null | Decoded |

`OpenPool` (`src/domain/portfolio.ts:54-81`):

| Field | Type | Status |
|---|---|---|
| `poolAddress` | string | Decoded |
| `binStep` | number | Decoded |
| `baseFee` | number | Decoded |
| `tokenX` | string | Decoded |
| `tokenY` | string | Decoded |
| `tokenXMint` | string | Decoded |
| `tokenYMint` | string | Decoded |
| `balances` | string | Decoded |
| `unclaimedFees` | string | Decoded |
| `feePerTvl24h` | string | Decoded |
| `pnl` | string | Decoded |
| `pnlPctChange` | string | Decoded |
| `pnlSol` | string or null | Decoded |
| `pnlSolPctChange` | string or null | Decoded |
| `totalDeposit` | string | Decoded |
| `openPositionCount` | number | Decoded |
| `listPositions` | string[] | Decoded |
| `positionsOutOfRange` | string[] | Decoded |
| `positionsPnl` | `PositionPnlEntry[]` | Optional, decoded by enrichment |
| `positionsLive` | `PositionLiveEntry[]` | Optional, decoded by enrichment |
| `positionsRange` | `PositionRangeEntry[]` | Optional, decoded by enrichment |
| `outOfRange` | boolean or null | Decoded |
| `poolPrice` | number | Decoded |
| `poolStateUpdatedAtBlockTime` | number or null | Optional, decoded |
| `poolStateUpdatedAtSlot` | number or null | Optional, decoded |

`PositionPnlEntry` (`src/domain/portfolio.ts:36-44`):
`address: string`, `createdAt: number | null`, `pnlUsd: string`,
`pnlPctChange: string`, `pnlSol: string | null`, and
`pnlSolPctChange: string | null`.

`PositionLiveEntry` (`src/domain/portfolio.ts:26-34`):
`address: string`, optional `createdAt: number | null`, `amountX: string`,
`amountY: string`, `feeX: string`, and `feeY: string`.

`PositionRangeEntry` (`src/domain/portfolio.ts:46-52`):
`address: string`, `minPrice: string`, `maxPrice: string`, and
`poolActivePrice: string | null`.

**Live observation from 2026-08-08:** an open-pool response also contained
`collectFeeMode`, `tokenXIcon`, `tokenYIcon`, `rewardX`, `rewardY`,
`balancesSol`, `unclaimedFeesSol`, `totalDepositSol`, `updatedAt`,
`poolStateUpdatedAtSlot`, and `poolStateUpdatedAtBlockTime`. The first nine
fields are not in `OpenPool`; the last two are decoded when present. This is an
observation, not a complete contract for extra fields.

### `GET /portfolio`

- Service method: `closedPortfolio` (`src/services/MeteoraApi.ts:215-221`).
- Query: `user`, `page` (default `1`), and `page_size` (default `50`).
- Schema: `ClosedPortfolioResponse` (`src/domain/portfolio.ts:119-129`).

Top-level fields are `hasNext: boolean`, `page: number`, `pageSize: number`,
`totalCount: number`, `totalPositions: number`, and `pools: ClosedPool[]`.

`ClosedPool` (`src/domain/portfolio.ts:97-117`):

| Field | Type | Status |
|---|---|---|
| `poolAddress` | string | Decoded |
| `binStep` | string or number | Decoded |
| `baseFee` | string or number | Decoded |
| `lastClosedAt` | number or null | Decoded |
| `tokenX` | string | Decoded |
| `tokenY` | string | Decoded |
| `tokenXMint` | string | Decoded |
| `tokenYMint` | string | Decoded |
| `totalDeposit` | string | Decoded |
| `totalWithdrawal` | string | Decoded |
| `totalFee` | string | Decoded |
| `totalDepositSol` | string | Optional, decoded |
| `totalWithdrawalSol` | string | Optional, decoded |
| `totalFeeSol` | string | Optional, decoded |
| `pnlUsd` | string | Decoded |
| `pnlSol` | string | Decoded |
| `pnlSolPctChange` | string | Decoded |
| `pnlPctChange` | string | Decoded |

No current repository fixture establishes the complete live shape of a
non-empty closed portfolio. Treat any observed extra fields as unverified until
the endpoint is tested with data.

### `GET /pools/{address}`

- Service method: `pool` (`src/services/MeteoraApi.ts:222`).
- Schema: `DlmmPool` (`src/domain/pool.ts:16-44`).

| Field | Type | Status |
|---|---|---|
| `address` | string | Decoded |
| `name` | string | Decoded |
| `created_at` | number | Decoded |
| `token_x` | `TokenInfo` | Decoded |
| `token_y` | `TokenInfo` | Decoded |
| `tvl` | number | Decoded |
| `current_price` | number | Decoded |
| `apr` | number | Decoded |
| `apy` | number | Decoded |
| `farm_apr` | number | Decoded |
| `has_farm` | boolean | Decoded |
| `dynamic_fee_pct` | number | Decoded |
| `pool_config` | object | Decoded |
| `volume` | `TimeWindowData` | Decoded |
| `fees` | `TimeWindowData` | Decoded |
| `protocol_fees` | `TimeWindowData` | Decoded |
| `fee_tvl_ratio` | `TimeWindowData` | Decoded |
| `cumulative_metrics` | `{ volume: number; fees: number }` | Decoded |

`pool_config` contains `bin_step`, `base_fee_pct`, `max_fee_pct`, and
`protocol_fee_pct`, all numbers. `TimeWindowData`
(`src/domain/common.ts:23-31`) contains numeric fields for `30m`, `1h`, `2h`,
`4h`, `12h`, and `24h`.

`TokenInfo` (`src/domain/pool.ts:4-14`) contains `address: string`,
`name: string`, `symbol: string`, `decimals: number`, `price: number`,
`is_verified: boolean`, `holders: number`, and `market_cap: number`.

**Live observation from 2026-08-08:** a pool response also contained fields
including `reserve_x`, `reserve_y`, `token_x_amount`, `token_y_amount`,
`reward_mint_x`, `reward_mint_y`, `farm_apy`, `is_blacklisted`, `launchpad`,
`tags`, `freeze_authority_disabled`, and `total_supply`. These fields are not
decoded. The observed response used `cumulative_metrics.fees`, which matches
the repository schema.

### `GET /pools`

- Service method: `pools` (`src/services/MeteoraApi.ts:223-240`).
- Query: `sort_by`, `query`, `page` (default `1`), `page_size`, and `filter_by`.
  If `sortBy` has no colon, the service appends `:desc`.
- Schema: `DlmmPoolsResponse` (`src/domain/pool.ts:46-53`).

The response contains `total: number`, `pages: number`, `current_page: number`,
`page_size: number`, and `data: DlmmPool[]`. Each item has the shape described
for `GET /pools/{address}`.

### `GET /positions/{poolAddress}/pnl`

- Service method: `positionPnl` (`src/services/MeteoraApi.ts:186-203`).
- Query: `user`, `status` (`open`, `closed`, or `all`; default `all`), `page`
  (default `1`), and `page_size` (default `100`).
- Schema: `PositionPnLResponse` (`src/domain/position.ts:44-62`).

Top-level fields:

| Field | Type | Status |
|---|---|---|
| `totalCount` | number | Decoded |
| `page` | number | Decoded |
| `pageSize` | number | Decoded |
| `hasNext` | boolean | Decoded |
| `positions` | `PositionPnLData[]` | Decoded |
| `tokenX` | string or null | Decoded |
| `tokenXPrice` | string | Decoded |
| `tokenY` | string or null | Decoded |
| `tokenYPrice` | string | Decoded |
| `solPrice` | string or null | Optional, decoded |
| `rewardTokenX` | string or null | Decoded |
| `rewardTokenXPrice` | string | Decoded |
| `rewardTokenY` | string or null | Decoded |
| `rewardTokenYPrice` | string | Decoded |

`PositionPnLData` (`src/domain/position.ts:16-42`) contains:

| Field | Type | Status |
|---|---|---|
| `positionAddress` | string | Decoded |
| `minPrice`, `maxPrice` | string | Decoded |
| `lowerBinId`, `upperBinId` | number | Decoded |
| `feePerTvl24h` | string | Decoded |
| `isClosed` | boolean | Decoded |
| `pnlUsd`, `pnlPctChange` | string | Decoded |
| `pnlSol`, `pnlSolPctChange` | string, number, or null | Optional, decoded |
| `allTimeDeposits` | `TokenPairTotal` | Decoded |
| `allTimeWithdrawals` | `TokenPairTotal` | Decoded |
| `allTimeFees` | `TokenPairTotal` | Decoded |
| `unrealizedPnl` | `UnrealizedPnl` or null | Optional, decoded |
| `closedAt`, `createdAt` | number or null | Decoded |
| `isOutOfRange` | boolean or null | Decoded |
| `poolActiveBinId` | number or null | Decoded |
| `poolActivePrice` | string or null | Decoded |

`TokenPairTotal` (`src/domain/common.ts:16-21`) contains `tokenX`, `tokenY`,
and `total`. Each token amount has `amount: string`, `amountSol: string | null`,
and `usd: string`; `total` has `usd: string` and `sol: string | null`.

`UnrealizedPnl` (`src/domain/position.ts:4-14`) contains `balances: number`,
`balancesSol: string | null`, and `TokenAmount` fields named
`balanceTokenX`, `balanceTokenY`, `unclaimedFeeTokenX`,
`unclaimedFeeTokenY`, `unclaimedRewardTokenX`, and `unclaimedRewardTokenY`.

### `GET /pools/{address}/historical-volume`

- Service method: `poolHistoricalVolume` (`src/services/MeteoraApi.ts:288-294`).
- Schema: `PoolHistoricalVolumeArray` (`src/domain/pool.ts:55-64`).
- Expected decoded response: an array of objects with `timestamp: number` and
  `volume: number`.

**Live observation from 2026-08-08:** this path returned `404 Not Found` in the
test environment. The observation does not establish that all deployments
behave the same way. The service still calls this path and still expects the
array schema.

### `GET /pools/{address}/ohlcv`

- Service method: `poolOhlcv` (`src/services/MeteoraApi.ts:295-305`).
- Query: `timeframe` (default `24h`), optional `start_time`, and optional
  `end_time`.
- Schema: `PoolOhlcvResponse` (`src/domain/pool.ts:65-81`).

The response contains `start_time: number`, `end_time: number`,
`timeframe: string`, and `data: OhlcvCandle[]`. Each candle contains numeric
`timestamp`, `open`, `high`, `low`, `close`, and `volume` fields.

## 2. Meteora Pool Discovery API

### `GET /pools`

- Service methods: `discoverPools` and `discoveryPoolByAddress`
  (`src/services/MeteoraApi.ts:306-335`).
- Query for discovery: optional `page_size` (default `50`), `filter_by`,
  `timeframe`, and `category`. Address lookup sends `page_size=1` and
  `query={address}`.
- Schema: `DiscoveryPoolsResponse` (`src/domain/discovery.ts:65-74`).

Top-level fields are `total: number`, optional `pages: number`, optional
`current_page: number`, optional `page_size: number`, and `data: DiscoveryPool[]`.

`DiscoveryPool` (`src/domain/discovery.ts:20-63`):

| Field | Type | Status |
|---|---|---|
| `pool_address`, `name`, `pool_type` | string | Decoded |
| `pool_created_at` | number | Decoded |
| `token_x`, `token_y` | `DiscoveryTokenInfo` | Decoded |
| `tvl`, `active_tvl`, `pool_price`, `volatility`, `volume`, `fee` | number | Decoded |
| `fee_active_tvl_ratio` | number | Decoded |
| `active_positions`, `active_positions_pct`, `open_positions` | number | Decoded |
| `pool_config` | optional `{ bin_step: number; base_fee_pct: number }` | Decoded |
| `dlmm_params` | optional `{ bin_step: number; collect_fee_mode: string }` | Decoded |
| `base_token_has_critical_warnings` | optional boolean | Decoded |
| `quote_token_has_critical_warnings` | optional boolean | Decoded |
| `base_token_has_high_supply_concentration` | optional boolean | Decoded |
| `base_token_has_high_single_ownership` | optional boolean | Decoded |
| `pool_price_change_pct`, `volume_change_pct`, `fee_change_pct` | optional number | Decoded |
| `swap_count`, `unique_traders`, `min_price`, `max_price`, `fee_pct` | optional number | Decoded |
| `price_trend` | optional unknown | Decoded |

`DiscoveryTokenInfo` (`src/domain/discovery.ts:3-18`) contains
`address`, `symbol`, `name` as strings; optional nullable `icon`; `decimals`,
`price`, `market_cap`, `holders`, `organic_score`, and `created_at` as numbers;
optional `dev` string; optional nullable `launchpad`; and optional
`warnings: unknown[]`.

**Live observation from 2026-08-08:** the API response included additional
fields such as `after_key`, `has_more`, token verification and supply fields,
ratio-change fields, and other pool statistics. They are not part of the
current repository schemas and are ignored. The observation is not a guarantee
that those fields are always present.

## 3. RugCheck API

### `GET /v1/tokens/{mint}/report/summary`

- Implementation: `src/services/RugCheck.ts:80-126`.
- Schema: `TokenSummary` (`src/services/RugCheck.ts:21-39`).

The decoded response contains `mint` (optional string), `score: number`,
`score_normalised: number`, optional `risks`, `lpLockedPct: number`,
`tokenType: string`, and `tokenProgram: string`.

Each risk contains `name: string`, `level: string`, optional `score: number`,
and optional `description: string`.

The public service responses are narrower than the HTTP schema:

- `getSummary` returns `{ score, risks, lpLockedPct }`, where each risk is
  `{ name, level }`; it returns `null` when the request or decode fails.
- `getScore` returns `number | null` and extracts `score`.

## 4. Jupiter APIs

### `GET /swap/v2/order`

- Implementation: `src/services/Zap.ts:180-207`.
- Query: `inputMint`, `outputMint`, `amount`, `taker`, and optional
  `slippageBps`.
- Schema: `JupiterOrderResponse` (`src/services/Zap.ts:131-135`).

| Field | Type | Status |
|---|---|---|
| `transaction` | string or null | Decoded |
| `requestId` | string | Decoded |
| `errorMessage` | optional string | Decoded |

The service requires a non-null `transaction`, signs it locally, and sends the
signed transaction to the execute endpoint. A null transaction becomes a
`JupiterApiError` with the supplied error message or `no route`.

**Live observation from 2026-08-08:** one order response contained additional
quote, route, fee, payer, transaction-validity, and timing fields. Those fields
are not decoded by this repository and should not be treated as part of its
response contract.

### `POST /swap/v2/execute`

- Implementation: `src/services/Zap.ts:221-246`.
- Request body: `signedTransaction` and `requestId` strings.
- Schema: `JupiterExecuteResponse` (`src/services/Zap.ts:137-141`).

| Field | Type | Status |
|---|---|---|
| `status` | `"Success"` or `"Failed"` | Decoded |
| `signature` | string | Decoded |
| `error` | optional string | Decoded |

The service treats a status other than `Success` as a `JupiterApiError`.

### `GET /strict`

- URL: `https://token.jup.ag/strict`.
- Implementation: `src/services/TokenMeta.ts:46-59`.
- Schema: `TokenList` and `TokenListEntry` (`src/services/TokenMeta.ts:12-18`).
- Response: an array of entries with `address: string`, `symbol: string`,
  `decimals: number`, and `name: string`.

`TokenMeta.get` maps each entry to `{ symbol, decimals, name }`, caches the
list for ten minutes, and returns `TokenMetaInfo | null` when the mint is not
available or the refresh fails (`src/services/TokenMeta.ts:20-28`, `61-73`).

**Live observation from 2026-08-08:** the test environment could not resolve
`token.jup.ag`, so the endpoint response was not independently verified there.
The shape above is the repository schema, not a live-response guarantee.

## 5. Internal Service Responses

These are not direct HTTP responses. They are values returned by the SDK, RPC,
and service layers to application code.

### Solana connection

`Solana` (`src/services/Solana.ts:6-27`) exposes a cached Solana `Connection`
created from `config.rpcUrl` with commitment `confirmed`, and a configured
`Keypair` signer. The service does not define a response schema for raw RPC
payloads.

### `DlmmService`

The public interface is in `src/services/Dlmm.ts:41-102`.

- `previewRange` returns `RangePreview`: `activeBinId`, `minBinId`, `maxBinId`,
  and `binStep` numbers; `tokenXMint` and `tokenYMint` strings; and
  `decimalsX` and `decimalsY` numbers.
- `quotePositionCost` returns `PositionCostQuote`
  (`src/domain/onchain.ts:37-48`): `positionCount`, `positionCost`,
  `positionReallocCost`, `bitmapExtensionCost`, `binArraysCount`,
  `binArrayCost`, `transactionCount`, `totalCost`, `nonRefundableCost`, and
  `refundableCost`, all numbers.
- `createPosition` returns `CreatePositionResult`
  (`src/domain/onchain.ts:19-25`): `signatures: string[]`,
  `positions: string[]`, `minBinId: number`, `maxBinId: number`, and
  `binCount: number`.
- `fetchUserPositions` returns `UserPositionLive[]`
  (`src/services/Dlmm.ts:52-60`): `poolAddress`, `positionAddress`,
  `amountX`, `amountY`, `feeX`, and `feeY` as strings, plus optional nullable
  `createdAt`.
- `closePosition`, `addLiquidity`, `removeLiquidity`, `claimFee`, and
  `claimReward` return transaction signature strings.
- `attachLivePositions` adds optional `positionsLive` entries to open pools.
  Each entry contains `address`, optional nullable `createdAt`, `amountX`,
  `amountY`, `feeX`, and `feeY`.
- `enrichOpenPortfolioPnl` in `MeteoraApi` adds `positionsPnl` and, when
  `withRanges` is true, `positionsRange` entries to open pools
  (`src/services/MeteoraApi.ts:243-287`).

### `ZapService`

The public interface is in `src/services/Zap.ts:49-80`.

- `claimAndZapOut` and `closeAndZapOut` return `ZapOutResult`: a
  `transactions: Transaction[]` array, `outputMint: string`, and optional
  `claimSig`, `closeSig`, and `zapSig` strings.
- `swapExactIn` returns `SwapExactInResult`: `signature: string`,
  `received: BN`, and `outputMint: string`.
- `getSolBalance` returns a `BN` containing lamports.

### Screening

`Screening` returns `ScreenResult` (`src/lib/screening.ts:178-182`):
`pools: ScreenedPool[]`, `total: number`, and `filtered: number`.

`ScreenedPool` (`src/domain/screened.ts:1-46`) contains:

`pool`, `name`, `baseSymbol`, `baseMint`, `quoteSymbol`, `tokenXAddress`, and
`priceTrend` as strings (with `priceTrend` nullable); `baseIcon` and `quoteIcon`
as nullable strings; `tvl`, `activeTvl`, `mcap`, `holders`, `organicScore`,
`quoteOrganic`, `feeActiveTvlRatio`, `volatility`, `binStep`, `baseFeePct`,
`volume`, `fee`, `activePositions`, `openPositions`, `score`, `price`,
`swapCount`, and `uniqueTraders` as numbers; `tokenAgeHours`, `fromAthPct`,
`priceChangePct`, `volumeChangePct`, and `poolAgeHours` as nullable numbers;
and optional nullable `rugScore`, `priceSeries`, `bundlePct`, `top10Pct`,
`botHoldersPct`, `globalFeesSol`, `isRugpull`, `isWash`, `devSoldAll`,
`dexScreenerPaid`, `priceVsAthPct`, and `lpLockedPct`.

## 6. Errors

HTTP and decode failures are represented by tagged errors in `src/errors.ts`.
The fields below are the error values exposed by the services, not guaranteed
payloads from upstream APIs.

| Tag | Fields |
|---|---|
| `MeteoraApiError` | `path`, optional `status`, `message` |
| `JupiterApiError` | `stage` (`order`, `execute`, or `audit`), optional `status`, `message` |
| `RugCheckApiError` | `mint`, optional `status`, `message` |
| `DecodeError` | `source`, `message` |
| `RpcError` | `op`, `message` |
| `OnchainError` | `op`, `message` |
| `ConfigError` | `message` |
| `SignerError` | `message` |
| `WalletError` | `message` |
| `ValidationError` | `message` |
| `StateError` | `file`, `message` |

`errorMessage` returns an error's `message` when available
(`src/errors.ts:70-78`).
