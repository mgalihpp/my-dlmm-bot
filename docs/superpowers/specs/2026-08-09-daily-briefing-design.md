# Daily Briefing — Design

## Ringkasan

Fitur Telegram baru: **daily briefing** — narasi LLM harian pukul 09:00 waktu lokal yang merangkum kondisi portfolio, aktivitas 24 jam terakhir, dan snapshot pasar (top pool screening). Bisa juga dipicu manual via command `/briefing`. Jika LLM gagal, fallback ke versi data mentah terstruktur — briefing tetap terkirim. Selalu dikirim, tidak terikat notif level.

## Tujuan & non-tujuan

- **Tujuan**: satu pesan harian yang memberi pemilik bot gambaran cepat: kesehatan portfolio, apa yang berubah kemarin, dan kondisi pasar.
- **Non-tujuan**: tidak ada data market eksternal baru (harga SOL dll). Market snapshot = top pool dari `screenPools()` yang sudah ada. Tidak ada state persisten baru. Tidak ada perubahan config. Tidak mengubah perilaku cycle/TP/SL/OOR.

## Arsitektur

### File baru `src/telegram/agent/briefing.ts`

| Fungsi | Tanggung jawab |
|---|---|
| `collectBriefingData(cfg)` | Kumpulkan 3 sumber data: portfolio+stats, journal 24j, top pool screening |
| `buildBriefingPrompt(data)` | Bangun prompt narasi (LLM) |
| `formatBriefing(text)` | Wrap narasi LLM jadi pesan Telegram |
| `formatBriefingFallback(data)` | Versi data mentah terstruktur (dipakai saat LLM gagal) |
| `runBriefing(bot, chatId, cfg)` | Orkestrasi: kumpulkan → LLM → kirim; LLM gagal → fallback |

### Sumber data (`collectBriefingData`)

1. **Portfolio + stats**:
   - `state.plans` — posisi terbuka + jumlah SOL.
   - PnL per posisi via `api.positionPnl(plan.pool, wallet, "open")`, cari posisi by `positionAddress`. Reuse pola `pnlByPool` dari `commands.ts` (skip plan tanpa `positionAddress`, skip gagal fetch, `pnlPctValue`).
   - `tradeStats(loadSignalWeights().perf)` — closes, wins, losses, winRate, avgPnlPct, totalPnlPct.
   - `deployedSol` = sum `plan.amountSol`.

2. **Aktivitas kemarin**:
   - `readJournalAll()` → filter entry `Date.parse(ts) >= now - 24h`.
   - `actionCounts(entries)` (dari `stats.ts`) — open, hold, tp, sl, close, blocked, failed.

3. **Market snapshot**:
   - `screenPools()` → `rankPools(pools, { minCandidate: 0, maxCandidates: 5, weights })` pakai `heuristicScore`.
   - Ambil field per pool: `name`, `heuristic`, `feeActiveTvlRatio`, `volume`, `priceVsAthPct`, `globalFeesSol`.

### Prompt (`buildBriefingPrompt`)

```
You are a portfolio manager for a Solana DLMM liquidity bot. Write a concise
daily briefing (under 300 words, plain text, simple markdown bullets) covering:
1. Portfolio health — open positions, PnL, win rate, deployed SOL
2. Last 24h activity — what opened, closed, hit TP/SL, was blocked
3. Market snapshot — top screened pools, notable fees/volume

Language: Indonesian. Be specific, no filler. Flag risks: out-of-range positions,
losing streaks, blocked opens.

Data:
- Portfolio: <lines>
- Activity: <counts>
- Market: <top 5 pools: name, heuristic, feeTvlRatio, volume, priceVsAthPct>
```

### Fallback (`formatBriefingFallback`)

Data mentah tersusun, dikirim saat LLM gagal:

```
📋 Daily briefing · <tanggal>
━━━━━━━━━━━━
📦 Portfolio (N open)
  • PoolA N SOL — PnL +x%
  ...
Deployed X/Y SOL
Trades: N closed | win W% | avg A%
━━━━━━━━━━━━
📒 Last 24h
🚀 N open | 🎯 N tp/sl/close | ⛔ N blocked | ❌ N failed
━━━━━━━━━━━━
📈 Top pools
  • PoolA — heuristic 87 | fee/TVL 0.012 | vol $x | ATH 45%
```

### Error handling (`runBriefing`)

- Bungkus dalam try/catch. Gagal fetching portfolio atau screening → section tersebut di-skip, sisanya tetap jalan.
- `screenPools()` gagal → market section kosong; portfolio + activity tetap.
- LLM request gagal / timeout / malformed → `formatBriefingFallback`.
- Semua gagal → kirim pesan error singkat.
- Nol posisi terbuka + nol journal 24j + nol pool → tetap kirim briefing "tidak ada aktivitas" (atau fallback data mentah).
- Briefing **tidak menulis state, tidak memodifikasi plans/cooldowns/journal**. Read-only.

### Notifikasi

- Kirim langsung `bot.api.sendMessage(chatId, msg, MD)` — **tidak** lewat `notify()` karena briefing harus selalu terkirim (tidak terikat notif level).
- Fire-and-forget error handling (try/catch di sekitar sendMessage).

## Scheduling

### `schedule.ts` — tambah `delayToDaily(hour, nowMs)`

Ms sampai jam `hour` (0-23, waktu lokal) berikutnya:

```
function delayToDaily(hour: number, nowMs: number): number {
  const d = new Date(nowMs);
  const target = new Date(d);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
  return target.getTime() - nowMs;
}
```

Catatan: waktu lokal = timezone mesin yang menjalankan bot (`Date`/`setHours` pakai zona lokal). Dipilih karena user minta "09:00" tanpa zona spesifik.

### `schedule.ts` — tambah `dailyScheduleAt(hour)`

Sama pola `alignedSchedule`:

```
export const dailyScheduleAt = (hour: number) =>
  Schedule.makeWithState<void, void, number>(void 0, (now) =>
    Effect.succeed([
      void 0,
      0,
      ScheduleDecision.continueWith(
        ScheduleInterval.after(now + delayToDaily(hour, now)),
      ),
    ]),
  );
```

### Masalah run pertama

`Effect.repeat(effect, schedule)` selalu menjalankan `effect` **sekali segera saat startup**, baru setelah itu konsultasi schedule (pola ini disengaja untuk cycle/event/oor — "run pertama jalan saat startup"). Untuk briefing ini salah: briefing pertama harus di 09:00 berikutnya, bukan saat bot start.

Solusi: bungkus job dengan `Effect.delay` yang menghitung `delayToDaily(9, Date.now())` **per-run** (efek menghasilkan Duration, dievaluasi tiap kali job dijalankan):

```
const run = () =>
  Effect.delay(
    Effect.tryPromise(job).pipe(Effect.catchAll(logError)),
    Effect.sync(() => Duration.millis(delayToDaily(9, Date.now()))),
  );
runtime.runFork(Effect.repeat(run(), dailyScheduleAt(9)));
```

Sekuens:
1. `Effect.repeat` jalankan `run()` pertama: sleep sampai 09:00 berikutnya → job jalan. ✓ (bukan saat startup)
2. Schedule `dailyScheduleAt(9)` konsultasi setelah job selesai (~09:00:00.x): delay ke 09:00 besok. ✓
3. Repeat jalankan `run()` lagi: sleep `delayToDaily(9, now≈09:00)` ≈ 24h → job jalan di 09:00. ✓

Tidak ada drift dan tidak ada state baru — kedua lapis delay menghitung dari `now` per run.

## Wiring engine (`engine.ts`)

- `RuntimeAgent` interface tambah `runBriefing(): Promise<void>`.
- `createAgent` tambah `briefingFiber` (fiber ke-4):
  - `start()`: `briefingFiber = runtime.runFork(Effect.repeat(run(), dailyScheduleAt(9)))` dengan `run()` seperti di atas, job = `() => { if (rt.state.enabled) return runBriefing(bot, chatId, cfg); }`.
  - `stop()`: `stopFiber(briefingFiber)` — fiber berhenti saat agent stop.
- `runBriefing()` method (wrapper engine):
  - `const cfg = resolveAgentConfigFrom(await getConfig())` → `await runBriefing(bot, chatId, cfg)`.
  - **Tidak** set `state.running` dan **tidak** guard pada `state.running` — briefing boleh jalan paralel dengan cycle (read-only, tidak konflik tulis).

Catatan: guard `enabled` ada di job terjadwal (bukan di core `runBriefing`) — jadi command `/briefing` tetap bisa dipakai manual walau agent stopped (core function tanpa guard enabled).

## Command (`commands.ts`)

- `bot.command("briefing")` → `await rt.runBriefing()`, reply "📋 Briefing sent." (atau langsung tanpa reply — briefing itu sendiri yang muncul).
- Tidak ada callback handler baru.

## File yang berubah

| File | Perubahan |
|---|---|
| `src/telegram/agent/briefing.ts` | **Baru** — seluruh logika |
| `src/telegram/agent/schedule.ts` | Tambah `delayToDaily` |
| `src/telegram/agent/engine.ts` | `briefingFiber`, `runBriefing()` |
| `src/telegram/agent/commands.ts` | Command `/briefing` |

## Testing

- **`test/agent-briefing.test.ts`** (baru):
  - `buildBriefingPrompt` menghasilkan prompt yang mengandung nama pool & data portfolio (pure).
  - `formatBriefingFallback` meng-escape markdown dan menyertakan section portfolio/activity/market (pure).
- **`test/agent-schedule.test.ts`** (update):
  - `delayToDaily(9, ...)`:
    - before 09:00 → ms ke 09:00 hari ini.
    - exactly 09:00 → ms ke 09:00 besok (24h).
    - after 09:00 → ms ke 09:00 besok.
  - boundary test pakai `Date` konstruksi waktu lokal.
- Nol test E2E Telegram.
- Verifikasi: `npm run check && npm run typecheck && npm test`.
