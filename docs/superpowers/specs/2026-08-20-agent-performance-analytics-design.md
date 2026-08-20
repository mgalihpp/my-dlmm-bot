# Agent Performance Analytics Charts — Design

Date: 2026-08-20
Author: Galih + Muse Spark
Status: Approved

## Purpose

Tambah dashboard analisa performa AI agent di halaman `/agent` (`src/web-react/app/routes/agent.tsx`) yang memvisualisasikan operasional + finansial selama automasi sebagai chart. Ganti area `CycleChart` lama (stacked bar last 12 cycles) dengan tabbed dashboard compact: **Operational | Financial | Signals**, dengan range selector `7d / 30d / 90d / All` dan drill-down detail per cycle via Sheet. Tetap read-only, tetap `recharts` + shadcn, no new dependency.

Menggantikan `src/web-react/app/components/agent/cycle-chart.tsx` dengan dashboard yang lebih lengkap, tanpa mengubah schema file runtime.

## Decisions

- **Pendekatan A (extended loader payload)**: semua agregasi pure server-side di `src/shared/agent-analytics.ts`, `fetchAgent()` return `analytics` tambahan. Tidak tambah API route, tidak kirim raw journal ke client. Direkomendasikan karena selaras pola existing, testable, payload <15KB.
- **Reuse file runtime as-is**: `.vexis-agent-journal.jsonl`, `.vexis-agent.json`, `.vexis-agent-signals.json`. Schema tidak diubah. Missing file = empty.
- **Range via query param** `?range=7d|30d|90d|all` seperti `?action=` sekarang. Default `30d`. Di-parse di `routes/agent.tsx` loader, preserve `action/page` saat switch range.
- **Operasional per cycle (last 100) + finansial agregasi harian/mingguan**: 7d/30d = bucket harian, 90d/all = mingguan. Menghindari sparse finansial jika per cycle.
- **Tabs di posisi CycleChart lama**: tidak tambah section panjang di bawah journal. Compact, tidak bikin page kepanjangan.
- **Klik chart → Sheet detail** (reuse style `pool-detail-sheet.tsx`): tampilkan breakdown cycle/pool, rationale, guardrail, tx link, LLM status, signal snapshot. Tidak sekadar tooltip.
- **Lazy + Suspense**: tiap chart lazy seperti `CycleChart` sekarang, tidak regress FCP.

## Architecture

```
src/shared/
└── agent-analytics.ts              # NEW — pure helpers, no FS

src/web-react/
├── app/
│   ├── lib/server/agent.server.ts  # MODIFY — tambah range, baca signals, build analytics
│   ├── routes/agent.tsx            # MODIFY — parse ?range=
│   └── components/agent/
│       ├── agent-content.tsx       # MODIFY — ganti CycleChart → PerformanceTabs
│       ├── cycle-chart.tsx         # DEPRECATE → hapus setelah rilis (atau keep 1 versi)
│       ├── performance-tabs.tsx    # NEW — Tabs + RangeSelector + header
│       ├── cycle-detail-sheet.tsx  # NEW — Sheet detail per cycle/pool
│       └── charts/
│           ├── operational-charts.tsx # NEW — O1 O2 O3
│           ├── financial-charts.tsx   # NEW — F1 F2 F3
│           └── signal-charts.tsx      # NEW — S1 S2
```

### Data flow

1. `routes/agent.tsx:loader` parse `rawPage`, `rawAction` (existing) + `rawRange`. `parseRange(rawRange) → Range`, fallback `30d`.
2. `fetchAgent(page, rawAction, range)`:
   - `readJournalAll(join(root, ".vexis-agent-journal.jsonl"))` (existing)
   - `loadState(join(root, ".vexis-agent.json"))` (existing)
   - `loadSignalWeights(join(root, ".vexis-agent-signals.json"))` (new read, same repoRoot helper)
   - `cachedBriefing` (existing)
   - `payload = buildAgentPayload(...)` (existing)
   - `analytics = buildAnalytics({ journal, perf: signalWeights.perf, weights: signalWeights.weights, range, nowMs: Date.now() })`
   - return `{ ...payload, range, analytics, wallet, rpc }`
3. Client `PerformanceTabs` terima `analytics` + `range`, render tabs. `RangeSelector onChange` → `setSearchParams({ range: next, ...keep action/page })` → loader refetch SSR.
4. Klik bar/point → `setSelectedCycle(cycle)` → `CycleDetailSheet` open, cari `journal.find(e => e.cycle===selected)`.

### Dependencies

- Tetap `recharts@^3.8.0`, `radix-ui`, `shadcn` `ChartContainer`, `Tabs`, `Sheet`, `ToggleGroup`. Tidak tambah library.
- Optional internal reuse: `computeLift` dari `signalWeights.ts`, `tsLocal`/`shortAddr`/`solscanUrl` dari `lib/format.ts`.

## Data Model

### Types

```ts
// shared/agent-analytics.ts
export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export interface OperationalPoint {
  readonly cycle: number;
  readonly ts: string; // ISO
  readonly date: string; // YYYY-MM-DD local
  readonly opens: number;
  readonly holds: number;
  readonly blocked: number;
  readonly failed: number;
  readonly tp: number;
  readonly sl: number;
  readonly closes: number; // close action
  readonly llmStatus: LlmStatus;
  readonly successRate: number; // opens/(opens+holds)*100, 0 if no decision
}

export interface OperationalDaily {
  readonly date: string; // YYYY-MM-DD
  readonly cycles: number;
  readonly blockedRate: number; // 0-100
  readonly llmFailRate: number;
  readonly execFailRate: number;
  readonly avgSuccessRate: number;
}

export interface FinancialBucket {
  readonly label: string; // "12 May" or "W19"
  readonly date: string; // bucket start ISO
  readonly closes: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number | null; // null if closes===0
  readonly avgPnl: number | null;
  readonly totalPnl: number | null;
  readonly best: number | null;
  readonly worst: number | null;
}

export interface CumulativePoint {
  readonly label: string;
  readonly date: string;
  readonly cumPnl: number;
}

export interface DistributionBucket {
  readonly bucket: string; // "<-10", "-10_-5", "-5_-2", "-2_0", "0_2", "2_5", "5_10", ">10"
  readonly count: number;
}

export interface AnalyticsPayload {
  readonly operational: {
    readonly perCycle: readonly OperationalPoint[]; // last 100 filtered
    readonly daily: readonly OperationalDaily[];
  };
  readonly financial: {
    readonly buckets: readonly FinancialBucket[];
    readonly cumulative: readonly CumulativePoint[];
    readonly distribution: readonly DistributionBucket[];
  };
  readonly signals: {
    readonly weights: Record<SignalName, number>;
    readonly lifts: readonly { signal: SignalName; lift: number; weight: number }[];
    readonly perfCount: number;
    readonly minSamples: number;
  };
}

// web-react/app/lib/server/agent.server.ts
export interface AgentPayload {
  // existing fields
  readonly range: AnalyticsRange;
  readonly analytics: AnalyticsPayload;
}
```

### Computation helpers (pure)

- `parseRange(raw: string | null): AnalyticsRange` — allowlist check, default `"30d"`.
- `filterByRange(journal, perf, range, nowMs)` — `cutoff = nowMs - days*86400000` (7/30/90). `all` = no filter. Compare `Date.parse(entry.ts)` / `Date.parse(perf.closedAt)`. Invalid date = exclude. Mirip `windowEntries` di `agent-narrative.ts`.
- `operationalPerCycle(entries: JournalEntry[]): OperationalPoint[]` — per entry hitung action counts, `blocked = candidates.filter(c=>guardrail==="blocked").length`, `failed = execution==="failed"`, `successRate`. Return `entries.map(...).slice(-100)` setelah filter range.
- `operationalDaily(perCycle): OperationalDaily[]` — group by `date` (local `YYYY-MM-DD` via `new Date(ts).toLocaleDateString("en-CA")`), avg rates.
- `financialBuckets(perf, range): FinancialBucket[]` — sort `perf` by `closedAt`. Bucket key: hari (`YYYY-MM-DD`) untuk 7d/30d, minggu (ISO Mon) untuk 90d/all. Key via `getMonday(date)`. Per bucket hitung `wins/losses/winRate/avg/total/best/worst`. Label via `Intl.DateTimeFormat`.
- `cumulativePnl(buckets): CumulativePoint[]` — running sum `totalPnl`.
- `pnlDistribution(perf): DistributionBucket[]` — 8 bucket fixed: `<-10`, `-10_-5`, `-5_-2`, `-2_0`, `0_2`, `2_5`, `5_10`, `>10`. Count.
- `signalLifts(weights, perf, minSamples)` — reuse `computeLift` dari `signalWeights.ts` jika `perf.length >= minSamples` else `[]`. Sort desc lift.

### Range behaviour

| Range | Operational perCycle | Operational daily | Financial bucket |
|-------|---------------------|-------------------|------------------|
| 7d | last 7 hari | 7 points | harian (7) |
| 30d | last 30 hari | 30 points | harian (30) |
| 90d | last 90 hari | 90 points | mingguan (~13) |
| all | last 100 cycles | group all | mingguan (all time) |

### Backward compat / empty

- `.vexis-agent-signals.json` missing / `perf=[]` → `buckets=[], cumulative=[], distribution=[{bucket,count:0} x8], lifts=[]`, `perfCount=0`. UI tampil empty state, tidak crash.
- Journal empty → `perCycle=[], daily=[]`.
- Invalid `ts` / `closedAt` → skip entry, log warn tidak throw.

## Components

### PerformanceTabs (wrapper Card)

Path: `src/web-react/app/components/agent/performance-tabs.tsx`

Props: `{ analytics: AnalyticsPayload, range: AnalyticsRange }`

Structure:
- `Card` + `CardHeader` flex row: left `CardTitle "Performance Analytics"` + subtitle `Operational • Financial • Signals`, right `RangeSelector`.
- `RangeSelector`: `ToggleGroup` / `TabsList` pill: `7D | 30D | 90D | All`. Value = `range`, onChange → `setSearchParams({range: nextValue}, {preventScrollReset:true})` preserve `action/page`.
- `CardContent`:
  ```tsx
  <Tabs defaultValue="operational">
    <TabsList>
      <TabsTrigger value="operational">Operational</TabsTrigger>
      <TabsTrigger value="financial">Financial</TabsTrigger>
      <TabsTrigger value="signals">Signals</TabsTrigger>
    </TabsList>
    <TabsContent value="operational"><OperationalCharts data={analytics.operational} onCycleClick={...} /></TabsContent>
    <TabsContent value="financial"><FinancialCharts data={analytics.financial} /></TabsContent>
    <TabsContent value="signals"><SignalCharts data={analytics.signals} /></TabsContent>
  </Tabs>
  ```
- Lazy: `const OperationalCharts = lazy(() => import("./charts/operational-charts"))` sama untuk 2 lain, `Suspense fallback={<ChartCardSkeleton />}`.

### OperationalCharts

Path: `src/web-react/app/components/agent/charts/operational-charts.tsx`

Props: `{ data: AnalyticsPayload["operational"], onCycleClick: (cycle:number)=>void }`

Grid: `grid grid-cols-1 gap-4 @4xl/main:grid-cols-2` (ikut pattern `agent-content.tsx:26`), 3 chart semua `h-64` via `ChartContainer`.

**O1 Decisions per Cycle (Stacked Bar)**
- Data: `data.perCycle` (max 100, slice)
- `BarChart` + `CartesianGrid vertical=false` + `XAxis dataKey="cycle"` + `YAxis allowDecimals=false width=20` + `ChartTooltip` + 5 `Bar` stackId="a": `open/hold/tp/sl/close` (tambah hold vs existing 4).
- Colors: `open=var(--chart-1)`, `hold=var(--chart-5)` (muted), `tp=var(--chart-2)`, `sl=var(--chart-3)`, `close=var(--chart-4)`.
- `onClick` di `BarChart` → `onCycleClick(activePayload.cycle)`.
- Empty: centered `No cycles in this range.`
- Tooltip: `Cycle #45 • 2 open, 1 hold, 1 blocked, LLM ok`

**O2 Guardrail & Health Trend (LineChart)**
- Data: `data.daily` jika range 30d/90d/all else `perCycle` mapped to daily
- `LineChart` + 3 `Line type="monotone" dot=false strokeWidth=2`:
  - `blockedRate` stroke `var(--destructive)` 
  - `llmFailRate` stroke `var(--chart-4)` (amber)
  - `execFailRate` stroke `var(--chart-3)` dashed `strokeDasharray="4 4"`
- YAxis 0-100%, XAxis date label.
- Legend `ChartLegendContent`.

**O3 Success Rate Trend (Area)**
- `AreaChart` dengan `successRate` Area `type="natural"` fill gradient emerald 0.25, stroke emerald, plus `ReferenceLine y=50` dashed muted.
- YAxis 0-100.
- Tooltip `52% success (3 open / 6 decisions)`.

### FinancialCharts

Path: `src/web-react/app/components/agent/charts/financial-charts.tsx`

Props: `{ data: AnalyticsPayload["financial"], onBucketClick?: (label:string)=>void }`

**F1 Win Rate & Avg PnL by Bucket (ComposedChart)**
- `ComposedChart` data `buckets`
- `Bar dataKey="closes"` fill `var(--chart-1)` opacity 0.6, `Line dataKey="winRate"` stroke emerald, `Line dataKey="avgPnl"` stroke blue.
- Dual YAxis: left count, right %.
- XAxis label per bucket, `ChartTooltip`.
- Empty jika `buckets.length===0`.

**F2 Cumulative PnL (AreaChart)**
- Data `cumulative`
- Pattern copy `EquityChart` (`equity-chart.tsx:22`): compute `stops` gradient hijau/merah cross zero, `linearGradient id="cum-pnl-grad"`, `ReferenceLine y=0`, `Area type="natural"`.
- Empty `<2` points → `No closed trades yet — perf appears after TP/SL/close.` (copy `equity-chart.tsx:91`).
- Tooltip formatter `fmtPct`.

**F3 PnL Distribution (BarChart vertical)**
- Data `distribution` 8 bucket
- `BarChart layout="vertical"` + `XAxis type="number"` + `YAxis dataKey="bucket" type="category" width=60`
- `Bar` fill conditional: `count>0 && bucket.startsWith("-") || bucket==="<-10"` → red else emerald. Simpler: compute color per bucket.
- Tooltip `4 trades • -5 to -2%`.

### SignalCharts

Path: `src/web-react/app/components/agent/charts/signal-charts.tsx`

Props: `{ data: AnalyticsPayload["signals"] }`

**S1 Signal Lift (Horizontal Bar)**
- `BarChart layout="vertical"` data `lifts` sorted desc
- `Bar dataKey="lift"` fill `var(--chart-2)` if lift>0 else `var(--destructive)`, `ReferenceLine x=0`.
- XAxis lift -1..1, YAxis signal name.
- Banner jika `perfCount < minSamples`: `Need {minSamples - perfCount} more closes to learn (have {perfCount}). Weights neutral.`
- Tooltip `organicScore: lift +0.32 → weight 1.45`

**S2 Current Weights (Bar)**
- `BarChart` data `Object.entries(weights)` sorted desc weight
- `Bar dataKey="weight"` fill `var(--chart-1)`, `ReferenceLine y=1` dashed `Neutral (1.0)`.
- YAxis signal, XAxis weight.
- Badge `high >=1.2`, `low <=0.7`, `neutral` seperti `weightsSummary` di `signalWeights.ts:327`.

### CycleDetailSheet

Path: `src/web-react/app/components/agent/cycle-detail-sheet.tsx`

Props: `{ cycle: number | null, journal: readonly AgentJournalEntry[], onOpenChange }`

Use `Sheet` (shadcn) same as `pool-detail-sheet.tsx`:
- Header: `Cycle #45 • tsLocal(ts)` + badges `llmStatus` + `blocked count`.
- Content: map `entry.candidates` → `CandidateRow` (reuse dari `decision-journal.tsx:51` tanpa duplikat — extract ke `candidate-row.tsx` shared).
- Jika `journal` tidak ada entry untuk cycle (karena range filter) → cari di full journal via prop `allEntries`.
- Empty `No candidates` preserved.
- Footer: link `View in Journal` scroll to `DecisionJournal` (anchor).

### AgentContent integration

`agent-content.tsx:26` ganti:
```tsx
<Suspense fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}>
  <PerformanceTabs analytics={data.analytics!} range={data.range!} />
</Suspense>
```
Tetap `Suspense` + `ChartCardSkeleton`.

## Error Handling

- Pure helpers tidak throw. Invalid date / NaN → skip / return `[]`. `loadSignalWeights` already return `EMPTY` on missing/invalid file.
- Loader wrap `buildAnalytics` dalam try/catch; jika throw → `analytics` = empty payload + `error` di `AgentPayload` tidak, cukup empty (jangan bikin whole page `ok:false`).
- File read sync: jika `repoRoot()` salah / journal corrupted line → `readJournalAll` already skips malformed lines.
- Chart error boundary: `PerformanceTabs` wrap tiap `TabsContent` dengan `ErrorBoundary` fallback `Card` `Failed to render chart`.
- Empty states per chart (lihat Section 3) — tidak tampil 0 palsu.
- Type safety: `Effect.Schema` tidak perlu karena file runtime tidak pakai schema, tapi helper sanitize sudah ada di `state.ts`/`signalWeights.ts`.

## Testing

- `test/shared-agent-analytics.test.ts` (new, pure, inline fixtures, no FS):
  - `parseRange` — valid/invalid/default.
  - `operationalPerCycle` — fixture 5 entries mixed open/hold/blocked/failed/llm failed, assert counts, successRate, slice.
  - `operationalDaily` — group 2 entries same day, 1 next day, avg rates.
  - `filterByRange` — nowMs fixed, entries 10d ago vs 2d ago, range 7d vs all.
  - `financialBuckets` — perf 6 closes across 2 days vs 2 weeks, 7d= daily, 90d= weekly, winRate/avg/best/worst.
  - `cumulativePnl` — running sum.
  - `pnlDistribution` — 8 bucket counts, edge -10, 0, 10.
  - `signalLifts` — below minSamples → empty, above → sorted lifts (mock small perf).
  - Edge: empty journal/perf → empty arrays, not throw.
- `test/web-react-agent-page.test.ts` (extend):
  - Fixture temp dir: tulis `.vexis-agent-journal.jsonl` 3 lines, `.vexis-agent-signals.json` 2 perf, `.vexis-agent.json` minimal. Call `buildAgentPayload` + `buildAnalytics` via `fetchAgent` helper, assert `analytics.operational.perCycle.length`, `financial.buckets`, `signals.perfCount`.
  - Empty file case → empty analytics.
- No live RPC / Telegram / network in tests. Mock FS temp files.

## Verification

- `npm run check` (biome) — `src/shared/agent-analytics.ts` + `src/web-react` components.
- `npm run typecheck --prefix src/web-react` (react-router typegen + tsc) — must pass strict.
- `npm test` — new + existing tests green.
- Manual:
  - `npm run dev --prefix src/web-react` → `/agent` → cek 3 tabs render, switch 7d/30d/90d/All URL update preserve `action`, reload preserve range.
  - Klik bar O1 → sheet opens dengan kandidat benar, tx link valid.
  - Financial empty (fresh repo) → message tidak crash.
  - Wrap journal besar (5000 lines fixture) → load <200ms, chart tetap 100 points max.
- Out of scope: LLM regeneration, on-chain actions, legacy `src/web/` removal, export CSV.

## Out of scope

- On-chain write dari dashboard (read-only).
- LLM briefing regeneration dari UI.
- Export CSV/PNG chart.
- Realtime WebSocket — tetap polling via `useRevalidator` existing.
- Perubahan `JOURNAL_PAGE_SIZE` / `JOURNAL_MAX_LINES`.
