# VEXIS DLMM AI Agent

Agent Telegram otomatis untuk posisi DLMM (Meteora): **menemukan** pool kandidat via screening, **memutuskan** open/hold via LLM, lalu **membuka posisi** dengan guardrail deterministik. Ditambah monitoring TP/SL + posisi out-of-range (OOR).

Kode: `src/telegram/agent/`. Entry: `src/telegram/bot.ts` → `createAgent()` di `engine.ts`.

---

## Arsitektur umum

```
Screening (deterministik)  →  Kandidat (LLM)  →  Keputusan open/hold (LLM)
        ↓                                                       ↓
  [cooldown + dup filter]                        [validateOpenDecisions — anti-halusinasi]
                                                             ↓
                                              Guardrail deterministik (hard block)
                                                             ↓
                                              dlmm.createPosition (execution)
```

Tiga lapis pertahanan:

| Lapis | Mekanisme | Fungsi |
|---|---|---|
| 1. Screening | `screenPools` + `filterCooldown` + `filterDuplicates` | Pilih pool mana yang dipertimbangkan |
| 2. Keputusan | LLM (`requestOpenDecisions`) + `validateOpenDecisions` | Putuskan `open`/`hold` per pool |
| 3. Eksekusi | Guardrail deterministik (`guardrails.ts`) | Blokir open yang melanggar aturan — tak bisa di-bypass LLM |

**Kunci desain:** heuristic bukan penentu keputusan — hanya *memilih pool mana yang dilihat LLM* (`rankPools(..., minCandidate: 0)`). LLM adalah juri; guardrail adalah polisi.

---

## File & tanggung jawab

| File | Tanggung jawab |
|---|---|
| `engine.ts` | Orkestrasi: 3 job terjadwal, siklus, TP/SL, OOR, execution |
| `llm.ts` | Prompt builder, parser respons, request ke LLM (open decision + OOR) |
| `decision.ts` | `validateOpenDecisions` (anti-halusinasi), `tpslAction` |
| `heuristic.ts` | Skor deterministik 0-100 + `rankPools` (pemilihan kandidat) |
| `guardrails.ts` | Semua filter/blokir: dup, cooldown, risiko, budget, tx-cooldown |
| `state.ts` | State persist `.vexis-agent.json` (plans, cooldowns, llmStatus) |
| `journal.ts` | Journal JSONL `.vexis-agent-journal.jsonl` |
| `signalWeights.ts` | Bobot sinyal Darwinian (belajar dari PnL) |
| `format.ts` | Render pesan Telegram (status, summary, journal, portfolio) |
| `commands.ts` | Command + callback menu Telegram |
| `stats.ts` | Trade stats & action counts dari journal |
| `params.ts` | Build parameter `dlmm.createPosition` |
| `schedule.ts` | Penjadwalan periodik sejajar wall-clock |
| `notify.ts` | Level notifikasi + keyboard aksi |
| `log.ts` | Logging konsol agent |

---

## Siklus utama (`runCycle` → `evaluatePlans`)

Alur lengkap satu cycle:

1. **Guard kapasitas** — jika `openPositions >= maxOpenPositions`, screening + LLM di-skip.
2. **Screening** — `screenPools()` (via API Meteora). Gagal → siklus batal, notif error.
3. **Filter cooldown** — pool yang masih dalam `poolCooldown` disingkirkan (`filterCooldown`).
4. **Filter duplikat** — pool yang sudah punya posisi terbuka (sama pool / same base token) disingkirkan (`filterDuplicates`).
5. **Ranking** — `rankPools` sortir by `heuristicScore`, ambil `maxCandidates` teratas, `minCandidate: 0` (heuristic hanya seleksi, bukan gate).
6. **LLM decision** — `requestOpenDecisions({ cfg, candidates, weightsSummary, portfolioContext })`.
   - Prompt berisi tabel kandidat (heuristic, feeTvlRatio, organic, holders, volume, + field risiko: `priceVsAthPct`, `rugScore`, `top10Pct`, `bundlePct`, `botHoldersPct`, `globalFeesSol`, `activePositions`) dan konteks portfolio: `"X/Y open positions, deployed A/B SOL cap"` + ringkasan bobot Darwinian.
   - LLM jawab JSON: `[{"pool":"...","action":"open|hold","rationale":"..."}]`.
   - **Gagal → skip seluruh siklus.** Nol trade. Journal `llmStatus: "failed"`, log `❌ LLM failed — cycle skipped`, notif Telegram error, `return`.
7. **Anti-halusinasi** — `validateOpenDecisions`: buang decision pool yang tak dikenal / duplikat (diukur `dropped`).
8. **Loop keputusan** — per pool `open`:
   - `hold` → catat journal, selesai.
   - `open` → jalankan guardrail deterministik berurutan:
     1. `checkDuplicate` — posisi sudah ada di pool/token sama?
     2. `checkPoolCooldown` — pool dalam cooldown?
     3. `checkRisks` — rugpull/wash/bundle/bot/top10/global fees/dev sold all/dex paid/price-vs-ATH.
     4. `deriveOpenAmount` + `checkOpenGuardrail` — budget per-posisi & total, `maxOpenPositions`.
     5. `amountSol <= 0`? → blocked "no budget remaining".
     6. `checkCooldown` — tx-cooldown global sejak OPEN terakhir.
   - Tiap blokir → journal `guardrail: "blocked"` + `recordCooldown` + notif live.
5'. **Eksekusi** — `resolveCreatePresetFrom` → `buildCreateParams` → `dlmm.createPosition`. Sukses → push `rt.state.plans` + `executions`, journal `execution: "ok"` + `txSignature`, notif aksi. Gagal → journal `execution: "failed"`, notif gagal.
9. **Penyelesaian** — `rt.state.llmStatus = journal.llmStatus`, `appendJournal`, `saveState`, `formatCycleSummary(readJournal(1), journal.llmStatus, cooldowns)` → kirim summary.

### Status LLM (`llmStatus`)

| Nilai | Kondisi |
|---|---|
| `ok` | LLM sukses; ada keputusan |
| `skipped` | Nol kandidat setelah screening — normal, bukan error |
| `failed` | LLM error / timeout / respons tak ter-parse → siklus di-skip, nol trade |

### Pesan live in-cycle

Satu pesan Telegram diedit in-place saat fase berjalan (`liveSend`/`liveStep`): `🔎 screening pools...` → `⏳ N pools in cooldown` → `🔁 N already open` → `🧠 LLM: thinking...` → `🧠 LLM: N candidates → M decisions` → per keputusan `🚀/➖/⛔` → final summary.

---

## Job terjadwal

| Job | Interval | Fungsi | Decision engine |
|---|---|---|---|
| `cycle` | `max(txCooldownMs, 60s)` | Buka posisi baru | **Full-LLM** (`evaluatePlans`) |
| `event` | 30s | TP/SL check | Deterministik `tpslAction` |
| `oor` | `intervalMinutes * 60s` | TP/SL + posisi out-of-range | LLM OOR (`requestPositionDecisions`) |

Semua job dijalankan via `Effect.repeat(alignedSchedule(interval))` — menembak di **batas wall-clock** (`:00/:05/:10`), bukan dari akhir run (anti-drift). Run pertama langsung jalan saat startup.

### Daily briefing

- Job `briefing` — tiap hari 09:00 lokal (`delayToDaily(9)` + `Schedule.spaced(24h)`). Fire pertama di 09:00 berikutnya (bukan saat startup) via dynamic delay per-run.
- Kirim narasi LLM: portfolio health (posisi + PnL + win rate + deployed), aktivitas 24 jam terakhir (dari journal), market snapshot (top 5 pool screening).
- LLM gagal → fallback data mentah (`formatBriefingFallback`).
- Selalu terkirim (semua notifikasi agent selalu terkirim).
- Manual: `/briefing`.
- Read-only: tidak menulis state/plans/cooldowns/journal.
- File: `src/telegram/agent/briefing.ts`, `delayToDaily` di `schedule.ts`.

### TP/SL check (`evaluateTpSl`)
- Per plan terbuka: `api.positionPnl` → hitung `pnlPct`.
- OOR → kumpulkan ke daftar `oorPositions` untuk LLM OOR.
- `tpslAction(pnlPct, tpPct, slPct)`: `pnlPct >= tpPct` → `tp`; `pnlPct <= slPct` → `sl`; selain → `hold`.
- `tp`/`sl` → `zap.closeAndZapOut` → catat perf (appendPerf + kemungkinan recalc Darwinian), update plans/cooldowns/executions, journal, notif aksi.
- Posisi yang sudah closed on-chain → plan dihapus.

### OOR check (`evaluateOor`)
- `requestPositionDecisions({ cfg, positions })` → LLM putuskan `hold`/`close` per posisi.
- **Bedanya dengan open path:** LLM OOR gagal (`degraded`) → semua posisi di-hold, **bukan** crash — masih pakai jalur `degraded` sendiri (fitur full-LLM hanya mengubah jalur open).
- `close` → `zap.closeAndZapOut` → update state, journal, cooldown, notif.

---

## Guardrails (`guardrails.ts`)

Semua murni deterministik. Detail:

| Fungsi | Logika |
|---|---|
| `checkDuplicate` | Blokir jika plan lain memakai pool yang sama **atau** base token yang sama |
| `filterDuplicates` | Sama, untuk pre-filter kandidat sebelum LLM |
| `checkCooldown` | Tx-cooldown global sejak OPEN terakhir (`txCooldownMs`) |
| `checkPoolCooldown` | Cooldown per pool (address atau baseMint) |
| `filterCooldown` | Pre-filter pool dalam cooldown |
| `recordCooldown` | Tambah entry cooldown + prune yang expired |
| `checkRisks` | Blokir rugpull, wash, bundle% > cap, botHolders% > cap, top10% > cap, global fees < min, dex-paid, dev-sold-all, price-vs-ATH > cap |
| `checkOpenGuardrail` | `amount > maxSolPerPosition`, `deployed + amount > maxTotalSol`, `openCount >= maxOpenPositions` |
| `deriveOpenAmount` | `min(maxSolPerPosition, maxTotalSol - deployed)`; `0` kalau budget habis |
| `lastOpenExecutionAt` | Timestamp OPEN terakhir (untuk tx-cooldown; tp/sl/close diabaikan) |
| `adoptOnchainPlans` | Ambil posisi on-chain yang belum ditrack (buka manual / sebelum restart) |

### Default risk config (bila tidak di-set)

`risks.enabled: true`, `minTokenFeesSol: 30`, `maxBundlePct: 30`, `maxBotHoldersPct: 30`, `maxTop10Pct: 60`, `maxPriceVsAthPct: 80`, `blockWash/blockRugpull/blockDexScreenerPaid/blockDevSoldAll: true`.

---

## Heuristic (`heuristic.ts`)

Skor deterministik 0-100, komponen + bobot dasar:

| Sinyal | Bobot |
|---|---|
| feeActiveTvlRatio | 0.28 |
| organicScore | 0.20 |
| binStep | 0.16 |
| holders | 0.08 |
| volume | 0.08 |
| priceVsAthPct | 0.05 |
| rugScore | 0.05 |
| top10Pct | 0.03 |
| bundlePct | 0.02 |
| botHoldersPct | 0.02 |
| activePositions | 0.03 |

- Tiap komponen dinormalisasi ke `[0,1]` lalu rata-rata berbobot; bobot bisa di-override dari Darwinian (`weights`).
- `heuristicScore` dipakai: (a) sortir `rankPools`, (b) kolom di prompt LLM, (c) `heuristicScore` di journal.
- `rankPools`: sortir desc, filter `h >= minCandidate`, slice `maxCandidates`.

---

## Bobot sinyal Darwinian (`signalWeights.ts`)

- Persist: `.vexis-agent-signals.json` (default), berisi `weights`, `lastRecalc`, `recalcCount`, `closesSinceRecalc`, `history`, `perf`.
- `signalSnapshot(pool)` — rekam nilai 12 sinyal saat posisi dibuka.
- Saat TP/SL/OOR close: `appendPerf` catat `{closedAt, pnlPct, signals}`.
- `recalculateWeights` (bila `darwin.enabled` & `closesSinceRecalc >= recalcEvery`):
  - Window `windowDays`; butuh `minSamples` sample + ada win & loss.
  - Hitung `computeLift` per sinyal: selisih mean nilai ternormalisasi (win vs loss), arah dibalik utk sinyal lower-is-better.
  - Rank lift, kuartil teratas → `* boostFactor` (cap `weightCeiling`), kuartil terbawah → `* decayFactor` (floor `weightFloor`).
  - Simpan `changes` ke history.
- Default: `windowDays 60`, `recalcEvery 5`, `boostFactor 1.05`, `decayFactor 0.95`, `weightFloor 0.3`, `weightCeiling 2.5`, `minSamples 10`.
- `weightsSummary` — ringkasan text untuk prompt LLM: bobot tersortir, label `high`/`neutral`/`low`.

---

## LLM (`llm.ts`)

- Provider: `createOpenAICompatible` (AI SDK) + `generateText`, `temperature: 0`, `maxRetries: 1`, timeout `cfg.llm.timeoutMs`. Base URL default `https://api.openai.com/v1`, model default `gpt-4o-mini`.
- Api key: `agent.llm.apiKey` → fallback env `OPENAI_API_KEY`.

### Open decision (jalur cycle)

| Fungsi | Peran |
|---|---|
| `buildOpenDecisionPrompt(candidates, weightsSummary?, portfolioContext?)` | Bangun prompt tabel kandidat + instruksi open/hold |
| `parseOpenDecisionResponse(content)` | Parse JSON array; **null = malformed → skip cycle** |
| `requestOpenDecisions({cfg, candidates, weightsSummary?, portfolioContext?})` | Request + parse; kembalikan `{decisions, failed}` |

Parser:
- Terima array polos, array ber-fence markdown (` ```json `), atau object `{decisions: [...]}`.
- `action !== "open"` → `hold`; `pool` kosong → di-skip; `rationale` non-string → `""`.
- `"[]"` (LLM bilang open nol) → `[]` valid.
- Garbage / bukan array → `null` → cycle di-skip.

### OOR decision (jalur OOR)

- `buildPositionPrompt` — instruksi hold/close, tabel posisi (pool, pnlPct, range, active price).
- `parsePositionResponse` — `action !== "close"` → `hold`.
- `requestPositionDecisions` — `degraded` (bukan `failed`); kandidat nol → `{decisions: [], degraded: false}`.

---

## Decision (`decision.ts`)

- `validateOpenDecisions(candidates, decisions)` → `{decisions, dropped}`:
  - Set `known` dari pool id kandidat; hanya decision dengan `pool` yang persis cocok lolos.
  - Duplikat pool → hanya kemunculan pertama; sisanya dihitung `dropped`.
  - Urutan output = urutan input decision.
- `tpslAction(pnlPct, tpPct, slPct)` → `"tp" | "sl" | "hold"`.

---

## State & journal

### State — `.vexis-agent.json`

```json
{
  "enabled": false,
  "running": false,
  "lastCycleAt": null,
  "llmStatus": "skipped",
  "cycle": 0,
  "plans": [],
  "executions": [],
  "cooldowns": []
}
```

- `plans[]`: posisi yang ditrack `{pool, poolName, baseMint, amountSol, positionAddress, openedAt, signals?}`.
- `cooldowns[]`: `{pool, poolName, baseMint, until, reason}`.
- `executions[]`: `{at, action, pool, txSignature}`.

### Journal — `.vexis-agent-journal.jsonl`

Satu baris JSON per cycle (atau per aksi TP/SL/OOR):

```json
{
  "ts": "...",
  "cycle": 3,
  "llmStatus": "ok | failed | skipped",
  "candidates": [
    {
      "pool": "...",
      "poolName": "A/SOL",
      "heuristicScore": 87,
      "rationale": "string | null",
      "action": "open | hold | tp | sl | close",
      "guardrail": "pass | blocked",
      "blockedReason": "string | null",
      "execution": "ok | failed | null",
      "txSignature": "string | null"
    }
  ]
}
```

Catatan: `favorability` dan `score` **sudah dihapus** dari journal (fitur full-LLM).

---

## Notifikasi (`notify.ts`)

Semua notifikasi selalu terkirim (live, action, summary, error).

Keyboard aksi:
- `open`/`close` → tombol `📊 PnL` (detail posisi)
- `failed` → tombol `⚠️ Retry` (re-run TP/SL check)
- `open/tp/sl/close` → `📒 Journal`
- `error` → `🧼 Clear`
- tak ada aksi → `✓ Ok`

`notify` fire-and-forget — kegagalan kirim tak pernah menggagalkan logika agent.

---

## Komunikasi Telegram (`commands.ts`)

Command: `/agent` dengan argumen:
- `/agent start` — mulai agent
- `/agent stop` — hentikan agent
- `/agent status` — status dashboard
- `/agent portfolio` — portfolio + PnL
- `/agent journal [n]` — journal, n baris (max 20)
- `/agent` — default = status

Callback menu:
- `agent:start` / `agent:stop` — start/stop dari tombol
- `agent:status` / `agent:main` — refresh status
- `agent:portfolio` — portfolio
- `agent:journal`, `agent:journal:page:N`, `agent:journal:filter:all|opens|closes|blocked` — journal + pagination/filter
- `agent:pos:<actionId>` — detail posisi (drill-down), refresh, link Meteora
- `notif:pnl:<actionId>` — detail posisi dari notifikasi
- `notif:journal` — journal dari notifikasi
- `notif:retry:<pool>` — re-run TP/SL
- `notif:clear` — clear state
- `menu:agent`, `menu:journal` — spokes dari menu utama

Keyboard status menampilkan tombol per posisi terbuka (label `Name N SOL`).

---

## Config agent (`vexis.config.json` → `agent`)

File: `src/domain/config.ts` (schema) + `src/services/Config.ts` (resolver).

| Field | Default | Keterangan |
|---|---|---|
| `enabled` | `false` | Aktif tak otomatis — mulai via `/agent start` |
| `intervalMinutes` | `15` | Interval job `oor` (menit) |
| `maxCandidates` | `5` | Berapa kandidat teratas dilihat LLM |
| `minCandidate` | `70` | **`@deprecated`** — sudah tak men-gate keputusan (LLM yang decide). Kept utk kompatibilitas file config |
| `maxSolPerPosition` | `0.5` | Cap SOL per posisi |
| `maxTotalSol` | `3` | Cap SOL total deployed |
| `maxOpenPositions` | `4` | Maks posisi terbuka |
| `txCooldownMs` | `300000` | Cooldown antar OPEN |
| `poolCooldownMs` | `86400000` (24h) | Cooldown per pool setelah close/block |
| `tpPct` | `25` (atau `takeProfitPct`) | Take-profit % |
| `slPct` | `-10` (atau `stopLossPct`) | Stop-loss % |
| `llm.baseUrl` | `https://api.openai.com/v1` | Base URL OpenAI-compatible |
| `llm.model` | `gpt-4o-mini` | Model |
| `llm.apiKey` | env `OPENAI_API_KEY` | Api key |
| `llm.timeoutMs` | `120000` | Timeout request LLM |
| `risks.*` | lihat [Guardrails](#guardrails) | Filter risiko |
| `darwin.*` | lihat [Darwinian](#bobot-sinyal-darwinian) | Learning bobot |

Environment: `VEXIS_CONFIG` (path config), `VEXIS_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENAI_API_KEY`.

---

## Perilaku error

| Situasi | Aksi |
|---|---|
| Screening gagal | Cycle batal, notif error |
| LLM open decision gagal/timeout/malformed | **Skip seluruh cycle**, nol trade, journal `llmStatus: "failed"`, notif error |
| Nol kandidat | `llmStatus: "skipped"` — normal |
| LLM OOR gagal | Semua posisi di-hold (`degraded`) |
| Eksekusi `createPosition` gagal | Journal `execution: "failed"`, notif failed |
| Notif kirim gagal | Diabaikan (fire-and-forget) |
| Unhandled exception cycle | `catch` → notif error → cycle berikutnya jalan |

---

## Script & verify

- `npm run bot` — jalankan bot (tsx)
- `npm run bot:start` — jalankan dari `dist`
- Verify: `npm run check && npm run typecheck && npm test`

Test terkait: `test/agent-{decision,llm,format,store,stats,guardrails,heuristic,notify,config,schedule,commands}.test.ts`.
