# Desain: Narrative Agent Log (Web Dashboard)

Tanggal: 2026-08-13
Status: Disetujui

## Tujuan

Halaman `/agent` di web dashboard terasa "flat": panel `LATEST RUN / Decision context` hanya menampilkan satu kalimat templated plus badge, dan tabel jurnal tidak menampilkan `rationale` (teks LLM per keputusan) yang sebenarnya sudah tersimpan di journal. Tujuan: menambah narasi — prosa LLM (dengan fallback deterministik) + timeline kronologis per cycle yang menampilkan rationale.

## Keputusan Kunci

- **Pendekatan: modul narasi web khusus** (`src/web/agent-narrative.ts`), bukan reuse pipeline briefing Telegram (`collectBriefingData` melakukan network call screening + PnL — terlalu berat untuk halaman yang auto-refresh tiap 30 detik).
- **Prosa LLM**: bahasa Indonesia, konsisten dengan daily briefing Telegram (`buildBriefingPrompt` sudah berbahasa Indonesia).
- **Window narasi**: 24 jam terakhir — konsisten dengan window aktivitas briefing Telegram.
- **Caching on-demand + persisted TTL**: narasi digenerate saat halaman dirender dan cache stale; disimpan ke `.vexis-agent-narrative.json` (gitignored) agar restart tidak memicu LLM call ulang.
- **Fallback deterministik**: `buildRunSummary` menghasilkan 2–4 kalimat bahasa Indonesia dari data journal tanpa LLM — panel selalu punya prosa.
- **Timeline menggantikan tabel jurnal**; filter + pagination tetap berlaku, data sama.
- Page `/agent` berubah dari render sinkron (`Effect.sync`) menjadi async (`Effect.gen` + `AppConfig`); statistik, filter, chart tidak berubah.

## Data Flow

```
GET /agent | GET /partials/agent (auto-refresh 30s)
  → agentContent (Effect.gen)
      → readJournalAll() + loadState()
      → agentStats / journalRows / paginate (existing, unchanged)
      → narrativeFor(entries, state, llmCfg)   ← baru
          cache lookup (.vexis-agent-narrative.json)
          stale? → buildNarrativePrompt → requestNarrative → persist
          LLM gagal → buildRunSummary → persist (source: "fallback")
      → render: briefing panel (prosa) + cycle chart (existing) + timeline (baru)
```

TTL: regenerasi bila (a) tidak ada cache, (b) `ts` entri journal terbaru > `coveringTs`, atau (c) cache lebih tua dari 10 menit. Pada kegagalan LLM, teks fallback ikut dipersist sebagai cache sehingga maksimal satu percobaan LLM per 10 menit (tidak thrash saat outage).

## Perubahan

### 1. `src/web/agent-narrative.ts` (baru)

- `buildNarrativePrompt(entries, state)` — pure. Bahasa Indonesia, plain text, tanpa markdown, ≤ ~120 kata. Model berperan sebagai portfolio manager yang meringkas aktivitas otomatis 24 jam terakhir:
  1. Apa yang terjadi: open/close dengan nama pool, TP/SL, blocked dengan alasan.
  2. Anomali: eksekusi gagal, cycle dengan `llmStatus` gagal (keputusan heuristik-only).
  3. Catatan risiko penutup, gaya briefing Telegram ("Flag risks: out-of-range positions, blocked opens, concentrated capital").
  - Input: entri 24 jam terakhir (pool name, action, guardrail, blockedReason, rationale dipotong ~80 char, execution, llmStatus) + state (cooldown aktif + reason, executions, nomor cycle). Tidak ada network call.
- `requestNarrative(llmCfg, prompt)` — pola sama dengan `requestBriefing` (briefing.ts:201): `createOpenAICompatible` + `generateText`, temperature 0, timeout dari config.
- `buildRunSummary(entries, state)` — fallback deterministik, 2–4 kalimat bahasa Indonesia dari data yang sama (mis. "Siklus 242–262: 3 open (SOL-USDC, JUP-SOL), 1 TP, 2 blocked (maks posisi). LLM gagal di siklus 250 — keputusan berbasis heuristik.").
- Cache: `{ at, coveringTs, text, source: "llm" | "fallback" }` di `.vexis-agent-narrative.json`.
- `narrativeFor(...)` — orchestrator: load cache → stale check → generate/persist → return.

### 2. `src/web/pages/agent.ts`

- `agentContent` menjadi `Effect.gen`: `yield* AppConfig` untuk config `llm`; panggil `narrativeFor`; render panel briefing dengan prosa + badge sumber (`GENERATED` / `FALLBACK`). Error tetap `errorBanner` (pola existing agent.ts:328).
- `renderJournalTable` → `renderJournalTimeline`:
  - Blok cerita per cycle: header `#N · waktu`; entri per candidate.
  - Setiap entri: nama pool, badge action, badge guardrail, **teks rationale** (escapeHtml), blocked reason, status eksekusi, link tx Solscan (format sama seperti sekarang).
  - Cycle tanpa candidate: blok dim (`no candidates`).
  - Marker kecil `LLM FAILED` pada cycle dengan `llmStatus === "failed"`.
  - Grouping: rows hasil `journalRows` (sudah reverse-kronologis) dikelompokkan per cycle saat render — rows bersebelahan dengan cycle sama dalam satu blok. Filter + pagination tetap jalan di data yang sama.
- `briefingPanel` memakai prosa baru; badge "N BLOCKED" + caption tetap.

### 3. `src/web/theme.ts`

- Kelas CSS baru: `.timeline`, `.timeline-cycle`, `.timeline-entry`, `.timeline-rationale`, marker `LLM FAILED` — konsisten dengan panel dark existing (mono accents, badge colors sudah ada). Tidak ada dependency baru.

### 4. `.gitignore`

- Tambah `.vexis-agent-narrative.json` (konsisten dengan file runtime state agent lain).

### 5. Test

- `test/agent-narrative.test.ts` (baru):
  - `buildNarrativePrompt`: filter 24 jam, memuat nama pool/action/blocked reason, rationale terpotong, journal kosong.
  - `buildRunSummary`: journal kosong, action campur, blocked dengan reason, cycle llm failed.
  - Cache: matriks staleness (fresh / stale / tanpa cache / cycle baru / LLM gagal → fallback dipersist, tidak thrash).
- `test/agent-timeline.test.ts` (baru):
  - Grouping rows cycle bersebelahan, batas pagination.
- Update `test/agent-format.test.ts` bila helper yang diuji berpindah.
- Batas LLM di-mock (pola sama dengan test existing agent-llm).

## Error Handling

- LLM gagal / config `llm.apiKey` kosong → `buildRunSummary` dipersist sebagai cache (`source: "fallback"`), panel tetap berisi prosa. Tidak ada error yang bocor ke render.
- Cache file corrupt / tidak terbaca → dianggap tidak ada cache, diregenerasi (pola sama dengan `loadState`/`readJournalAll`).
- Error lain saat render → `errorBanner` (pola existing).

## Testing / Verifikasi

- `npm run check` (biome)
- `npm run typecheck`
- `npm test` (vitest)

## Non-Goals

- Tidak mengubah pipeline briefing Telegram (`briefing.ts` tetap untuk chat).
- Tidak menambah LLM call per cycle dari engine — narasi hanya on-demand saat halaman dibuka (cache TTL menjaga biaya).
- Tidak mengubah format jurnal di disk (`.vexis-agent-journal.jsonl`).
- Tidak mengubah statistik, filter, chart, pagination yang ada.
- Tidak menambah dependency baru.
