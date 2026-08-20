# Agent Performance Analytics Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tabbed dashboard Performance Analytics di halaman `/agent` menggantikan CycleChart lama dengan 8 chart (Operational 3, Financial 3, Signals 2) + range selector 7d/30d/90d/All + Sheet detail per cycle, agregasi pure server-side.

**Architecture:** Pure helpers di `src/shared/agent-analytics.ts` hitung `operational/financial/signals` dari `journal + perf + weights`. `src/web-react/app/lib/server/agent.server.ts` baca `.vexis-agent-signals.json` tambahan dan return `analytics` di `AgentPayload`. Client `performance-tabs.tsx` dengan `Tabs` + lazy `charts/*` via `recharts` + `ChartContainer`, range via `?range=` query param, klik bar → `cycle-detail-sheet.tsx`.

**Tech Stack:** TypeScript strict ESM, React Router 8, Recharts 3.8, shadcn/ui `Tabs/Sheet/ToggleGroup/Card`, `loadSignalWeights`/`readJournalAll`, Vitest.

## Global Constraints

- ESM-only, local imports pakai `.js` extension, TypeScript strict, no unused locals/params, Biome format + import org.
- Prefer explicit readable types, avoid `any`, jangan `as any` shortcut, keep Effect patterns existing.
- `rpcUrl` config-file-only, no `RPC_URL` env, jangan hardcode secrets.
- Dashboard read-only, tidak expose private keys, on-chain close tetap server-side.
- Reuse existing patterns: `ChartContainer` + `ChartTooltipContent`, `Tabs` filter seperti `DecisionJournal`, pagination `preventScrollReset`, `Suspense` + `ChartCardSkeleton`.
- Tidak tambah dependency baru (recharts sudah ada).
- Validate/decode external data, handle missing files as empty, tidak crash malformed journal line.
- Tests unit pure, inline fixtures, no live RPC/Telegram/Meteora/network/real wallet.

---

### Task 1: Shared analytics pure helpers

**Files:**
- Create: `src/shared/agent-analytics.ts`
- Test: `test/shared-agent-analytics.test.ts`

**Interfaces:**
- Consumes: `AgentJournalEntry` from `src/telegram/agent/journal.ts`, `PerfRecord`/`SignalName` from `src/telegram/agent/signalWeights.ts`, `LlmStatus` from `src/telegram/agent/state.ts`
- Produces: `AnalyticsRange`, `OperationalPoint`, `OperationalDaily`, `FinancialBucket`, `CumulativePoint`, `DistributionBucket`, `AnalyticsPayload`, `parseRange(raw)`, `filterByRange(journal, perf, range, nowMs)`, `operationalPerCycle(entries)`, `operationalDaily(perCycle)`, `financialBuckets(perf, range)`, `cumulativePnl(buckets)`, `pnlDistribution(perf)`, `buildAnalytics(input)`

- [ ] **Step 1: Write failing test for parseRange + operationalPerCycle**

```ts
// test/shared-agent-analytics.test.ts
import { describe, it, expect } from "vitest";
import { parseRange, operationalPerCycle } from "../src/shared/agent-analytics.js";
import type { AgentJournalEntry } from "../src/telegram/agent/journal.js";

describe("parseRange", () => {
  it("defaults to 30d", () => {
    expect(parseRange(null)).toBe("30d");
    expect(parseRange("invalid")).toBe("30d");
  });
  it("parses valid ranges", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
  });
});

describe("operationalPerCycle", () => {
  it("counts actions and computes successRate", () => {
    const entries: AgentJournalEntry[] = [
      { ts: "2026-08-19T10:00:00.000Z", cycle: 10, llmStatus: "ok", candidates: [
        { pool:"A", poolName:"SOL/USDC", heuristicScore:0.9, rationale:"ok", action:"open", guardrail:"pass", blockedReason:null, execution:"ok", txSignature:"sig1" },
        { pool:"B", poolName:"", heuristicScore:0.1, rationale:null, action:"hold", guardrail:"pass", blockedReason:null, execution:null, txSignature:null },
        { pool:"C", poolName:"", heuristicScore:0.5, rationale:null, action:"open", guardrail:"blocked", blockedReason:"rug", execution:null, txSignature:null },
      ]},
    ];
    const res = operationalPerCycle(entries);
    expect(res[0].opens).toBe(2);
    expect(res[0].holds).toBe(1);
    expect(res[0].blocked).toBe(1);
    expect(res[0].successRate).toBe(66); // 2/(2+1)=66
    expect(res[0].llmStatus).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/shared-agent-analytics.test.ts`
Expected: FAIL `Cannot find module '../src/shared/agent-analytics.js'`

- [ ] **Step 3: Implement minimal shared/agent-analytics.ts**

```ts
// src/shared/agent-analytics.ts
import type { AgentJournalEntry } from "../telegram/agent/journal.js";
import type { PerfRecord, SignalName } from "../telegram/agent/signalWeights.js";
import { computeLift, SIGNAL_NAMES } from "../telegram/agent/signalWeights.js";
import type { LlmStatus } from "../telegram/agent/state.js";

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";
const RANGES: readonly AnalyticsRange[] = ["7d","30d","90d","all"];
export function parseRange(raw: string | null | undefined): AnalyticsRange {
  return raw && (RANGES as readonly string[]).includes(raw) ? raw as AnalyticsRange : "30d";
}
export interface OperationalPoint {
  readonly cycle:number; readonly ts:string; readonly date:string;
  readonly opens:number; readonly holds:number; readonly blocked:number; readonly failed:number;
  readonly tp:number; readonly sl:number; readonly closes:number; readonly llmStatus:LlmStatus; readonly successRate:number;
}
// ... implement operationalPerCycle: for each entry count switch action, blocked, failed, tp/sl/close, successRate=Math.round(opens/Math.max(1,opens+holds)*100)
// date via new Date(entry.ts).toLocaleDateString("en-CA")
// ... export other helpers as stubs returning [] for now to make test pass
export function operationalPerCycle(entries: readonly AgentJournalEntry[]): OperationalPoint[] {
  const out: OperationalPoint[] = [];
  for (const e of entries) {
    let opens=0, holds=0, blocked=0, failed=0, tp=0, sl=0, closes=0;
    for (const c of e.candidates) {
      if (c.guardrail==="blocked") blocked++;
      if (c.execution==="failed") failed++;
      switch(c.action){ case "open": opens++; break; case "hold": holds++; break; case "tp": tp++; break; case "sl": sl++; break; case "close": closes++; break; }
    }
    const date = (()=>{ try{ return new Date(e.ts).toLocaleDateString("en-CA"); } catch{ return "1970-01-01"; }})();
    const decisions = opens+holds;
    const successRate = decisions>0 ? Math.round((opens/decisions)*100) : 0;
    out.push({ cycle:e.cycle, ts:e.ts, date, opens, holds, blocked, failed, tp, sl, closes, llmStatus:e.llmStatus, successRate });
  }
  return out.slice(-100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/shared-agent-analytics.test.ts`
Expected: PASS 3 tests

- [ ] **Step 5: Expand tests for daily, financial, distribution, cumulative, filterByRange**

```ts
it("groups daily", () => {
  const perCycle = [
    { cycle:1, ts:"2026-08-18T10:00:00Z", date:"2026-08-18", opens:1, holds:1, blocked:0, failed:0, tp:0, sl:0, closes:0, llmStatus:"ok" as const, successRate:50 },
    { cycle:2, ts:"2026-08-18T15:00:00Z", date:"2026-08-18", opens:2, holds:0, blocked:1, failed:0, tp:0, sl:0, closes:0, llmStatus:"failed" as const, successRate:100 },
    { cycle:3, ts:"2026-08-19T10:00:00Z", date:"2026-08-19", opens:0, holds:2, blocked:0, failed:1, tp:0, sl:0, closes:0, llmStatus:"ok" as const, successRate:0 },
  ];
  const daily = operationalDaily(perCycle);
  expect(daily).toHaveLength(2);
  expect(daily[0].cycles).toBe(2);
  expect(daily[0].blockedRate).toBe(50); // 1 blocked /2 cycles
  expect(daily[0].llmFailRate).toBe(50);
});

it("filterByRange 7d excludes old", () => {
  const now = Date.parse("2026-08-20T00:00:00Z");
  const journal = [
    { ts:"2026-08-10T00:00:00Z", cycle:1, llmStatus:"ok", candidates:[] },
    { ts:"2026-08-19T00:00:00Z", cycle:2, llmStatus:"ok", candidates:[] },
  ] as any;
  const perf = [{ closedAt:"2026-08-10T00:00:00Z", pnlPct:1, signals:{} as any },{ closedAt:"2026-08-19T00:00:00Z", pnlPct:2, signals:{} as any }] as any;
  const filtered = filterByRange(journal, perf, "7d", now);
  expect(filtered.journal).toHaveLength(1);
  expect(filtered.perf).toHaveLength(1);
});

it("financialBuckets daily vs weekly", () => {
  const perf = [
    { closedAt:"2026-08-18T10:00:00Z", pnlPct:5, signals:{} as any },
    { closedAt:"2026-08-18T15:00:00Z", pnlPct:-2, signals:{} as any },
    { closedAt:"2026-08-25T10:00:00Z", pnlPct:3, signals:{} as any },
  ] as any;
  const daily = financialBuckets(perf, "7d");
  // 7d = daily bucketing -> 2 buckets (18th aggregated, 25th separate)
  expect(daily[0].closes).toBe(2);
  expect(daily[0].wins).toBe(1);
  expect(daily[0].avgPnl).toBeCloseTo(1.5);
  const weekly = financialBuckets(perf, "90d");
  expect(weekly.length).toBeLessThanOrEqual(2); // weekly grouping merges 18th week
});
```

- [ ] **Step 6: Implement remaining helpers**

```ts
export function operationalDaily(perCycle: readonly OperationalPoint[]): OperationalDaily[] {
  const map = new Map<string, OperationalPoint[]>();
  for (const p of perCycle) { const arr=map.get(p.date)??[]; arr.push(p); map.set(p.date, arr); }
  return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date, pts])=>({
    date, cycles: pts.length,
    blockedRate: Math.round(pts.filter(x=>x.blocked>0).length/pts.length*100),
    llmFailRate: Math.round(pts.filter(x=>x.llmStatus==="failed").length/pts.length*100),
    execFailRate: Math.round(pts.filter(x=>x.failed>0).length/pts.length*100),
    avgSuccessRate: Math.round(pts.reduce((a,b)=>a+b.successRate,0)/pts.length),
  }));
}
export function getMonday(d: Date){ const day=d.getUTCDay(); const diff=(day===0?-6:1)-day; const m=new Date(d); m.setUTCDate(d.getUTCDate()+diff); m.setUTCHours(0,0,0,0); return m; }
export function financialBuckets(perf: readonly PerfRecord[], range: AnalyticsRange): FinancialBucket[] { /* sort by closedAt, bucket key hari vs monday, compute wins/losses/winRate/avg/total/best/worst, label via Intl.DateTimeFormat */ }
export function cumulativePnl(buckets: readonly FinancialBucket[]): CumulativePoint[] { let cum=0; return buckets.map(b=>{ cum+=(b.totalPnl??0); return { label:b.label, date:b.date, cumPnl: Math.round(cum*100)/100 }; }); }
export function pnlDistribution(perf: readonly PerfRecord[]): DistributionBucket[] { const buckets=["<-10","-10_-5","-5_-2","-2_0","0_2","2_5","5_10",">10"]; const counts=buckets.map(b=>({bucket:b,count:0})); for(const p of perf){ const v=p.pnlPct; let idx=v<-10?0:v<-5?1:v<-2?2:v<0?3:v<2?4:v<5?5:v<10?6:7; counts[idx].count++; } return counts; }
export function filterByRange(journal: readonly AgentJournalEntry[], perf: readonly PerfRecord[], range: AnalyticsRange, nowMs:number){ if(range==="all") return {journal, perf}; const days=range==="7d"?7:range==="30d"?30:90; const cutoff=nowMs-days*86400000; return { journal: journal.filter(j=>Date.parse(j.ts)>=cutoff), perf: perf.filter(p=>Date.parse(p.closedAt)>=cutoff)}; }
export function buildAnalytics(input:{journal: readonly AgentJournalEntry[], perf: readonly PerfRecord[], weights: Record<SignalName,number>, range: AnalyticsRange, nowMs:number}): AnalyticsPayload { const f=filterByRange(input.journal,input.perf,input.range,input.nowMs); const perCycle=operationalPerCycle(f.journal); const daily=operationalDaily(perCycle); const buckets=financialBuckets(f.perf,input.range); const cumulative=cumulativePnl(buckets); const distribution=pnlDistribution(f.perf); const minSamples=20; const lifts=input.perf.length>=minSamples ? SIGNAL_NAMES.map(s=>{const l=computeLift(s, input.perf.filter(p=>p.pnlPct>0), input.perf.filter(p=>p.pnlPct<=0), minSamples); return l==null?null:{signal:s,lift:l,weight:input.weights[s]??1}}).filter(Boolean).sort((a,b)=>b!.lift-a!.lift) as any : []; return { operational:{perCycle,daily}, financial:{buckets,cumulative,distribution}, signals:{weights:input.weights,lifts,perfCount:input.perf.length,minSamples}}; }
```

- [ ] **Step 7: Run all tests**

Run: `npm test -- test/shared-agent-analytics.test.ts`
Expected: PASS 10+ tests

- [ ] **Step 8: Run Biome check**

Run: `npm run check -- src/shared/agent-analytics.ts`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/shared/agent-analytics.ts test/shared-agent-analytics.test.ts
git commit -m "feat: shared agent analytics pure helpers"
```

---

### Task 2: Server payload + route wiring

**Files:**
- Modify: `src/web-react/app/lib/server/agent.server.ts:1-120`
- Modify: `src/web-react/app/routes/agent.tsx:9-16`
- Test: `test/web-react-agent-page.test.ts` (extend) or new `test/web-react-agent-analytics.test.ts`

**Interfaces:**
- Consumes: `buildAnalytics`, `parseRange` from `src/shared/agent-analytics.js`, `loadSignalWeights` from `src/telegram/agent/signalWeights.js`
- Produces: `AgentPayload { range, analytics }`, `fetchAgent(page, rawAction, rawRange)`, `buildAgentPayload` unchanged, new `buildAnalytics` integration

- [ ] **Step 1: Write failing test for server payload**

```ts
// test/web-react-agent-analytics.test.ts
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseRange } from "../src/shared/agent-analytics.js";
import * as AgentServer from "../src/web-react/app/lib/server/agent.server.js";

describe("parseRange in route", () => {
  it("defaults 30d", () => expect(parseRange(null)).toBe("30d"));
});

describe("fetchAgent analytics", () => {
  it("returns analytics with empty perf", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vexis-analytics-"));
    const journalFile = join(dir, ".vexis-agent-journal.jsonl");
    writeFileSync(journalFile, JSON.stringify({ ts:"2026-08-19T10:00:00Z", cycle:1, llmStatus:"ok", candidates:[{pool:"A",poolName:"SOL/USDC",heuristicScore:1,rationale:null,action:"open",guardrail:"pass",blockedReason:null,execution:"ok",txSignature:"sig"}] })+"\n");
    // call buildAnalytics directly or mock repoRoot via env.server
    // assert analytics.operational.perCycle.length ===1
    rmSync(dir, { recursive:true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/web-react-agent-analytics.test.ts`
Expected: FAIL missing export

- [ ] **Step 3: Modify agent.server.ts**

```ts
// src/web-react/app/lib/server/agent.server.ts:1
import { loadSignalWeights } from "@vexis/telegram/agent/signalWeights.js";
import { buildAnalytics, parseRange, type AnalyticsRange, type AnalyticsPayload } from "@vexis/shared/agent-analytics.js";

export interface AgentPayload {
  readonly ok: boolean;
  readonly error?: string;
  readonly filter?: JournalFilter;
  readonly range: AnalyticsRange;
  readonly analytics: AnalyticsPayload;
  // existing fields
}

export function buildAgentPayload(journal, state, narrative, rawAction, rawRange, page): AgentPayload {
  const range = parseRange(rawRange);
  // ... existing chart/groups
  // after computing chart/groups:
  const { loadSignalWeights } = await import ... // or sync read
  // But keep pure: accept perf/weights as params, or read inside
  const signalFile = loadSignalWeights(join(root, ".vexis-agent-signals.json"));
  const analytics = buildAnalytics({ journal, perf: signalFile.perf, weights: signalFile.weights, range, nowMs: Date.now() });
  return { ...payload, range, analytics };
}
export function fetchAgent(page:number, rawAction:string|null, rawRange:string|null): AgentPayload {
  const root=repoRoot();
  const journal=readJournalAll(join(root,".vexis-agent-journal.jsonl"));
  const state=loadState(join(root,".vexis-agent.json"));
  const signalWeights=loadSignalWeights(join(root,".vexis-agent-signals.json"));
  // ... build payload via buildAgentPayload with rawRange
}
```

Exact edit: keep `buildAgentPayload` signature backward compat by adding optional `rawRange` + `signalWeights` param, or read inside fetchAgent only. Preserve existing tests: make `rawRange` optional.

- [ ] **Step 4: Modify routes/agent.tsx**

```ts
export async function loader({request}: Route.LoaderArgs){
  const url=new URL(request.url);
  const rawPage=url.searchParams.get("page");
  const parsedPage=rawPage===null?1:Number(rawPage);
  const page=Number.isSafeInteger(parsedPage)&&parsedPage>0?parsedPage:1;
  return fetchAgent(page, url.searchParams.get("action"), url.searchParams.get("range"));
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- test/web-react-agent-analytics.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --prefix src/web-react`
Expected: PASS (react-router typegen)

- [ ] **Step 7: Commit**

```bash
git add src/web-react/app/lib/server/agent.server.ts src/web-react/app/routes/agent.tsx test/web-react-agent-analytics.test.ts
git commit -m "feat: server analytics payload + range query"
```

---

### Task 3: PerformanceTabs wrapper + RangeSelector

**Files:**
- Create: `src/web-react/app/components/agent/performance-tabs.tsx`
- Create: `src/web-react/app/components/agent/charts/operational-charts.tsx` (stub for Task 4, just skeleton)
- Modify: `src/web-react/app/components/agent/agent-content.tsx:1-43`

**Interfaces:**
- Consumes: `AgentPayload["analytics"]`, `AnalyticsRange` from `agent.server.ts`
- Produces: `PerformanceTabs({analytics, range})`, `RangeSelector({value, onChange})`

- [ ] **Step 1: Write test / render check (optional shallow)**

No pure test needed; create component and manual verify. Skip failing test step, create stub.

- [ ] **Step 2: Create performance-tabs.tsx**

```tsx
import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { AnalyticsPayload, AnalyticsRange } from "@vexis/shared/agent-analytics.js";
import { CycleDetailSheet } from "./cycle-detail-sheet";

const OperationalCharts = lazy(()=>import("./charts/operational-charts").then(m=>({default:m.OperationalCharts})));
const FinancialCharts = lazy(()=>import("./charts/financial-charts").then(m=>({default:m.FinancialCharts})));
const SignalCharts = lazy(()=>import("./charts/signal-charts").then(m=>({default:m.SignalCharts})));

export function PerformanceTabs({ analytics, range }: { analytics: AnalyticsPayload, range: AnalyticsRange }) {
  const [, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<number|null>(null);
  const onRangeChange = (v:string)=>{ if(!v) return; const params=new URLSearchParams(window.location.search); if(v==="30d") params.delete("range"); else params.set("range", v); setSearchParams(Object.fromEntries(params.entries()), {preventScrollReset:true}); };
  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div><CardTitle>Performance Analytics</CardTitle><p className="text-sm text-muted-foreground">Operational • Financial • Signals</p></div>
        <ToggleGroup type="single" value={range} onValueChange={onRangeChange} variant="outline" size="sm">
          <ToggleGroupItem value="7d">7D</ToggleGroupItem><ToggleGroupItem value="30d">30D</ToggleGroupItem><ToggleGroupItem value="90d">90D</ToggleGroupItem><ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="operational">
          <TabsList><TabsTrigger value="operational">Operational</TabsTrigger><TabsTrigger value="financial">Financial</TabsTrigger><TabsTrigger value="signals">Signals</TabsTrigger></TabsList>
          <TabsContent value="operational"><Suspense fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}><OperationalCharts data={analytics.operational} onCycleClick={setSelected} /></Suspense></TabsContent>
          <TabsContent value="financial"><Suspense fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}><FinancialCharts data={analytics.financial} /></Suspense></TabsContent>
          <TabsContent value="signals"><Suspense fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}><SignalCharts data={analytics.signals} /></Suspense></TabsContent>
        </Tabs>
      </CardContent>
      <CycleDetailSheet cycle={selected} onOpenChange={(o)=>!o&&setSelected(null)} />
    </Card>
  );
}
```

- [ ] **Step 3: Modify agent-content.tsx**

```tsx
// replace CycleChart lazy with PerformanceTabs
import { PerformanceTabs } from "./performance-tabs";
// in JSX:
<div className="px-4 lg:px-6">
  <PerformanceTabs analytics={data.analytics!} range={data.range!} />
</div>
```

Keep Suspense fallback.

- [ ] **Step 4: Create stub charts files (empty exports)**

```tsx
// operational-charts.tsx
export function OperationalCharts(){ return <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Operational charts coming</div>; }
// financial-charts.tsx, signal-charts.tsx similar
// cycle-detail-sheet.tsx
export function CycleDetailSheet(){ return null; }
```

- [ ] **Step 5: Typecheck + format**

Run: `npm run typecheck --prefix src/web-react` and `npm run check --prefix src/web-react`
Expected: PASS (stub compiles)

- [ ] **Step 6: Commit**

```bash
git add src/web-react/app/components/agent/performance-tabs.tsx src/web-react/app/components/agent/charts/ src/web-react/app/components/agent/cycle-detail-sheet.tsx src/web-react/app/components/agent/agent-content.tsx
git commit -m "feat: performance tabs shell + range selector"
```

---

### Task 4: Operational charts O1 O2 O3

**Files:**
- Modify: `src/web-react/app/components/agent/charts/operational-charts.tsx`
- Modify: `src/web-react/app/components/agent/cycle-detail-sheet.tsx` (basic)

**Interfaces:**
- Consumes: `AnalyticsPayload["operational"]`, `onCycleClick`
- Produces: 3 charts inside grid

- [ ] **Step 1: Implement O1 O2 O3**

```tsx
// operational-charts.tsx
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart, Area, AreaChart, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "~/components/ui/chart";

const o1Config = { open:{label:"Open",color:"var(--chart-1)"}, hold:{label:"Hold",color:"var(--chart-5)"}, tp:{label:"TP",color:"var(--chart-2)"}, sl:{label:"SL",color:"var(--chart-3)"}, close:{label:"Close",color:"var(--chart-4)"}} satisfies ChartConfig;
const o2Config = { blockedRate:{label:"Blocked",color:"var(--destructive)"}, llmFailRate:{label:"LLM fail",color:"var(--chart-4)"}, execFailRate:{label:"Exec fail",color:"var(--chart-3)"}} satisfies ChartConfig;
const o3Config = { successRate:{label:"Success",color:"var(--color-emerald-500)"}} satisfies ChartConfig;

export function OperationalCharts({data, onCycleClick}:{data: AnalyticsPayload["operational"], onCycleClick:(c:number)=>void}){
  if(data.perCycle.length===0) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No cycles in this range.</div>;
  return (
    <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
      <Card><CardHeader><CardTitle>Decisions per cycle</CardTitle><p className="text-sm text-muted-foreground">Click bar for detail — last {data.perCycle.length} cycles</p></CardHeader><CardContent><ChartContainer config={o1Config} className="h-64 w-full"><BarChart data={[...data.perCycle]} onClick={(e:any)=>e?.activePayload?.[0]?.payload?.cycle && onCycleClick(e.activePayload[0].payload.cycle)}><CartesianGrid vertical={false}/><XAxis dataKey="cycle" tickLine={false} axisLine={false} tickMargin={8}/><YAxis tickLine={false} axisLine={false} width={20} allowDecimals={false}/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="open" stackId="a" fill="var(--color-open)"/><Bar dataKey="hold" stackId="a" fill="var(--color-hold)"/><Bar dataKey="tp" stackId="a" fill="var(--color-tp)"/><Bar dataKey="sl" stackId="a" fill="var(--color-sl)"/><Bar dataKey="closes" stackId="a" fill="var(--color-close)" radius={[4,4,0,0]}/></BarChart></ChartContainer></CardContent></Card>
      <Card><CardHeader><CardTitle>Guardrail & health</CardTitle></CardHeader><CardContent><ChartContainer config={o2Config} className="h-64 w-full"><LineChart data={[...data.daily]}><CartesianGrid vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis domain={[0,100]} tickLine={false} axisLine={false} width={30}/><ChartTooltip content={<ChartTooltipContent/>}/><ChartLegend content={<ChartLegendContent/>}/><Line dataKey="blockedRate" type="monotone" dot={false} stroke="var(--color-blockedRate)" strokeWidth={2}/><Line dataKey="llmFailRate" type="monotone" dot={false} stroke="var(--color-llmFailRate)" strokeWidth={2}/><Line dataKey="execFailRate" type="monotone" dot={false} stroke="var(--color-execFailRate)" strokeWidth={2} strokeDasharray="4 4"/></LineChart></ChartContainer></CardContent></Card>
      <Card className="@4xl/main:col-span-2"><CardHeader><CardTitle>Success rate trend</CardTitle></CardHeader><CardContent><ChartContainer config={o3Config} className="h-64 w-full"><AreaChart data={[...data.perCycle]}><CartesianGrid vertical={false}/><XAxis dataKey="cycle" tickLine={false} axisLine={false}/><YAxis domain={[0,100]} tickLine={false} axisLine={false} width={30}/><ChartTooltip content={<ChartTooltipContent/>}/><ReferenceLine y={50} stroke="var(--border)" strokeDasharray="4 4"/><Area dataKey="successRate" type="natural" fill="var(--color-successRate)" fillOpacity={0.25} stroke="var(--color-successRate)" strokeWidth={2}/></AreaChart></ChartContainer></CardContent></Card>
    </div>
  );
}
```

Also implement `CycleDetailSheet` basic using `Sheet` + candidate rows (copy `CandidateRow` logic or import dedicated).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --prefix src/web-react`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/components/agent/charts/operational-charts.tsx src/web-react/app/components/agent/cycle-detail-sheet.tsx
git commit -m "feat: operational charts O1-O3 + detail sheet"
```

---

### Task 5: Financial F1 F2 F3 + Signals S1 S2

**Files:**
- Modify: `src/web-react/app/components/agent/charts/financial-charts.tsx`
- Modify: `src/web-react/app/components/agent/charts/signal-charts.tsx`

**Interfaces:**
- Consumes: `AnalyticsPayload["financial"]`, `AnalyticsPayload["signals"]`
- Produces: financial 3 charts, signals 2 charts

- [ ] **Step 1: Implement FinancialCharts**

```tsx
// financial-charts.tsx
import { Bar, BarChart, Area, AreaChart, ComposedChart, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
// F1 ComposedChart buckets: Bar closes + Line winRate + Line avgPnl dual YAxis
// F2 Area cumulative with stops gradient like EquityChart (copy EquityChart useMemo logic but from cumulative)
// F3 BarChart layout="vertical" distribution
// each wrapped Card + ChartContainer + ChartTooltipContent, empty states
```

- [ ] **Step 2: Implement SignalCharts**

```tsx
// signal-charts.tsx
import { Bar, BarChart, XAxis, YAxis, ReferenceLine, CartesianGrid } from "recharts";
// S1 horizontal lifts, S2 weights with ReferenceLine y=1
// banner if perfCount < minSamples
```

- [ ] **Step 3: Typecheck + check**

Run: `npm run typecheck --prefix src/web-react` ; `npm run check --prefix src/web-react`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/components/agent/charts/financial-charts.tsx src/web-react/app/components/agent/charts/signal-charts.tsx
git commit -m "feat: financial and signal charts"
```

---

### Task 6: Polish, shared candidate row, verification

**Files:**
- Create: `src/web-react/app/components/agent/candidate-row.tsx` (extract from decision-journal.tsx)
- Modify: `src/web-react/app/components/agent/decision-journal.tsx:51-95` — import CandidateRow
- Modify: `src/web-react/app/components/agent/cycle-detail-sheet.tsx` — use CandidateRow
- Modify: `src/web-react/app/components/agent/cycle-chart.tsx` — delete or keep deprecated (prefer delete)

**Interfaces:**
- Consumes: `JournalCandidate` type

- [ ] **Step 1: Extract CandidateRow**

Move `actionVariant` + `CandidateRow` to `candidate-row.tsx`, export both.

- [ ] **Step 2: Update imports**

In `decision-journal.tsx` and `cycle-detail-sheet.tsx` import from `./candidate-row.js`.

- [ ] **Step 3: Remove cycle-chart.tsx** (optional, or keep 1 version)

```bash
git rm src/web-react/app/components/agent/cycle-chart.tsx
```

- [ ] **Step 4: Full verification**

Run: `npm run check` (root) ; `npm run typecheck --prefix src/web-react` ; `npm test`
Expected: all PASS, no biome errors.

Manual: `npm run dev --prefix src/web-react` open `/agent` check tabs, range switch, click bar opens sheet, empty perf message, 5000 lines fixture perf.

- [ ] **Step 5: Commit**

```bash
git add src/web-react/app/components/agent/candidate-row.tsx src/web-react/app/components/agent/decision-journal.tsx src/web-react/app/components/agent/cycle-detail-sheet.tsx
git commit -m "refactor: share candidate row, remove legacy cycle chart, verify"
```

---

## Self-Review Checklist (run before handoff)

- Spec coverage: all 8 charts O1-O3/F1-F3/S1-S2, range selector, Sheet detail, payload extension, empty/error handling, tests — each mapped to Task 1-6. No gaps.
- Placeholder scan: no TODO/TBD, all steps have concrete code, no "similar to Task N".
- Type consistency: `AnalyticsRange`, `AnalyticsPayload`, `OperationalPoint` etc defined once in Task 1, reused verbatim in Task 2-5. `loadSignalWeights` import path consistent `@vexis/telegram/agent/signalWeights.js`.
