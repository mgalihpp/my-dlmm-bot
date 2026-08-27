# Configuration reference

This document lists the configuration accepted by Vexis. The type definitions live in `src/domain/config.ts`; defaults are resolved in `src/services/Config.ts` and related services.

## Config loading

Vexis checks these paths in order:

1. The path in `VEXIS_CONFIG`
2. `./vexis.config.json`
3. `~/.vexis/config.json`

Environment overrides:

| Variable | Overrides |
|---|---|
| `VEXIS_PRIVATE_KEY` | `privateKey` |
| `TELEGRAM_BOT_TOKEN` | `telegramBotToken` |
| `TELEGRAM_CHAT_ID` | `telegramChatId` |
| `OPENAI_API_KEY` | `agent.llm.apiKey` when the config key is absent |
| `VEXIS_WEB_PASSWORD` | `web.password` |

`rpcUrl` is read from the config file. `RPC_URL` is not supported. The local config file is git-ignored because it may contain secrets.

## Top-level keys

| Key | Default | Purpose |
|---|---:|---|
| `wallet` | none | Default Solana wallet for portfolio queries. A CLI wallet argument takes precedence. |
| `privateKey` | none | Base64 or base58 keypair for signing on-chain operations. |
| `rpcUrl` | Solana public RPC | Solana RPC endpoint. |
| `dev` | `false` | Selects the development Meteora API where supported. |
| `pageSize` | `50` | Default portfolio page size. |
| `telegramBotToken` | none | Telegram bot token. |
| `telegramChatId` | none | Target Telegram chat ID. |
| `alertInterval` | `0` | Alert interval in minutes. `0` disables alerts. |
| `stopLossPct` | `-10` | Default stop-loss percentage. |
| `takeProfitPct` | `25` | Default take-profit percentage. |

## `agent`

The agent is disabled until started with `/agent start`.

| Key | Default | Purpose |
|---|---:|---|
| `enabled` | `false` | Persisted enabled state. |
| `intervalMinutes` | `15` | Out-of-range job interval. |
| `maxCandidates` | `5` | Number of screened pools sent to the LLM. |
| `minCandidate` | `70` | Deprecated compatibility key. It no longer gates opening decisions. |
| `maxSolPerPosition` | `0.5` | Maximum SOL allocated to one new position. |
| `maxTotalSol` | `3` | Maximum deployed SOL. |
| `maxOpenPositions` | `4` | Maximum tracked open positions. |
| `txCooldownMs` | `300000` | Minimum time between automatic opens. |
| `poolCooldownMs` | `86400000` | Cooldown for a pool after a close or block. |
| `tpPct` | `25` | Take-profit threshold. Falls back to `takeProfitPct`. |
| `slPct` | `-10` | Stop-loss threshold. Falls back to `stopLossPct`. |
| `notifLevel` | none | Deprecated compatibility key. Notifications are always sent. |

### `agent.llm`

| Key | Default | Purpose |
|---|---|---|
| `baseUrl` | `https://api.openai.com/v1` | OpenAI-compatible API base URL. |
| `model` | `gpt-4o-mini` | Model name. |
| `apiKey` | `OPENAI_API_KEY` | API key. |
| `timeoutMs` | `120000` | Request timeout. |

### `agent.risks`

These checks are deterministic and cannot be bypassed by the LLM.

| Key | Default | Purpose |
|---|---:|---|
| `enabled` | `true` | Enable risk checks. |
| `minTokenFeesSol` | `30` | Minimum global token fees in SOL. |
| `maxBundlePct` | `30` | Maximum bundled-holder percentage. |
| `maxBotHoldersPct` | `30` | Maximum bot-holder percentage. |
| `maxTop10Pct` | `60` | Maximum top-10-holder percentage. |
| `minFromAthPct` | `30` | Minimum distance below the all-time high. |
| `maxRugScore` | `500` | Maximum accepted RugCheck score (0-2500; pass ≤250, review ≤1250, blocked >1250). |
| `blockWash` | `true` | Block wash-trading signals. |
| `blockRugpull` | `true` | Block rug-pull signals. |
| `blockDexScreenerPaid` | `true` | Block paid DEX Screener pools. |
| `blockDevSoldAll` | `true` | Block pools where the developer sold all holdings. |

### `agent.blockedSessions`

No new position is opened while local wall-clock time falls inside any window. Useful to silence low-volatility sessions.

| Key | Default | Purpose |
|---|---:|---|
| `timezone` | `UTC` | Wall-clock timezone for `windows`. `UTC` or `WIB` (UTC+7). |
| `windows` | `[]` | Session windows. Each has `name` (string), `start` (`HH:MM`), `end` (`HH:MM`). Windows where `end <= start` wrap past midnight. Invalid `HH:MM` values are ignored. |

Example: `{ "timezone": "WIB", "windows": [{ "name": "NY lunch", "start": "12:00", "end": "13:00" }] }` blocks opens at 12:30 WIB. `{ "name": "Asia", "start": "22:00", "end": "02:00" }` blocks 22:00–02:00.

### `agent.darwin`

Darwinian weights are recalculated from closed-position results.

| Key | Default | Purpose |
|---|---:|---|
| `enabled` | `true` | Enable weight recalculation. |
| `windowDays` | `60` | Data window. |
| `recalcEvery` | `5` | Recalculate after this many closes. |
| `boostFactor` | `1.05` | Multiplier for stronger signals. |
| `decayFactor` | `0.95` | Multiplier for weaker signals. |
| `weightFloor` | `0.3` | Minimum weight. |
| `weightCeiling` | `2.5` | Maximum weight. |
| `minSamples` | `10` | Minimum samples before recalculation. |

## `pools`

Pool filters are sent to the Meteora Pool Discovery API. For numeric filters, omit the key or set it to `null` to avoid that bound.

| Keys | Default | Purpose |
|---|---:|---|
| `pageSize` | `50` | API page size. |
| `timeframe` | `30m` | Screening timeframe. |
| `category` | `top` | Pool category. |
| `minMcap`, `maxMcap` | `250000`, `10000000` | Base-token market-cap bounds. |
| `minHolders`, `maxHolders` | `500`, none | Holder-count bounds. |
| `minOrganic`, `maxOrganic` | `60`, none | Base-token organic-score bounds. |
| `minQuoteOrganic`, `maxQuoteOrganic` | `60`, none | Quote-token organic-score bounds. |
| `minTokenAgeHours`, `maxTokenAgeHours` | none | Token-age bounds. |
| `blockedLaunchpads` | `[]` | Launchpad names to exclude. |
| `minTvl`, `maxTvl` | `5000`, `200000` | TVL bounds. |
| `minActiveTvl`, `maxActiveTvl` | none | Active-TVL bounds. |
| `minVolume`, `maxVolume` | `1000`, none | Volume bounds for the selected timeframe. |
| `minVolume24h`, `maxVolume24h` | `500000`, none | Server-side 24-hour volume bounds. |
| `minFee`, `maxFee` | `50`, none | Fee bounds in USD. |
| `minFeeActiveTvlRatio`, `maxFeeActiveTvlRatio` | `0.05`, none | Fee-to-active-TVL ratio bounds. |
| `minBinStep`, `maxBinStep` | `20`, `125` | DLMM bin-step bounds. |
| `minVolatility`, `maxVolatility` | none | Volatility bounds. |
| `minPoolPrice`, `maxPoolPrice` | none | Pool-price bounds. |
| `minActivePositions`, `maxActivePositions` | none | Active-position bounds. |
| `minOpenPositions`, `maxOpenPositions` | none | Open-position bounds. |
| `minSwapCount`, `maxSwapCount` | none | Swap-count bounds. |
| `minUniqueTraders`, `maxUniqueTraders` | none | Unique-trader bounds. |
| `minPriceChangePct`, `maxPriceChangePct` | none | Price-change bounds. |
| `minVolumeChangePct`, `maxVolumeChangePct` | none | Volume-change bounds. |
| `priceTrend` | none | Price-trend filter. |
| `solPairOnly` | `true` | Restrict results to SOL pairs. |
| `displayLimit` | `15` | Number of pools shown by handlers and CLI output. |

`baseTokenHasHighSupplyConcentration` and `baseTokenHasHighSingleOwnership` default to `false` and are boolean screening flags.

## `create`

These values provide defaults for the Telegram create wizard.

| Key | Default | Purpose |
|---|---|---|
| `strategy` | `bidask` | `spot`, `bidask`, or `curve`. |
| `mode` | `single-y` | `two-sided`, `single-x`, or `single-y`. |
| `range` | `{ "type": "default" }` | `default`, `bin`, or `pct`, with matching bounds. |
| `amountPresets` | `[0.1, 0.25, 0.5, 1]` | SOL amount choices. |
| `xAmount`, `yAmount` | none | Fixed token amounts. |
| `autoSwap` | `false` in resolver | Allow automatic swaps when needed. |
| `slippageBps` | `100` | Swap slippage in basis points. |

## `web`

| Key | Default | Purpose |
|---|---:|---|
| `port` | `8080` | Dashboard server port. |
| `password` | none | Dashboard password. `VEXIS_WEB_PASSWORD` takes precedence. |

The dashboard does not expose private keys. Keep the password outside source control.
