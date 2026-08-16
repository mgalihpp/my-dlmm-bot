# Agent Page (React Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Agent route in `src/web-react/` with a real, read-only Agent dashboard that ports the legacy `src/web/pages/agent.ts` functionality onto the shadcn/React UI.

**Architecture:** A server-only module (`agent.server.ts`) reads the existing runtime files (`.vexis-agent-journal.jsonl`, `.vexis-agent.json`, `.vexis-agent-narrative.json`) via `repoRoot()` and reuses the legacy pure helpers (`agentStats`, `journalRows`, `timelineGroups`, `paginate`, `parseJournalFilter`). The route loader auth-guards and calls `fetchAgent`, returning a serializable `AgentPayload`. Client components render the payload with auto-refresh (30s) and server-driven filter/pagination via query params.

**Tech Stack:** React 19, React Router 7, Effect (imported through `@vexis/*`), recharts, shadcn/radix components, Vitest, Biome.

## Global Constraints

- ESM-only; local imports use `.js` extensions.
- TypeScript strict. No unused locals/parameters.
- Reuse legacy pure helpers — do NOT re-implement `agentStats`/`journalRows`/`timelineGroups`/`paginate`/`parseJournalFilter`.
- Server modules MUST be named `*.server.ts` (React Router treats them as server-only, excluded from client bundles). Do NOT import `@vexis/web/pages/agent.js` (or anything importing `node:fs`) from client components or from `routes/*.tsx` directly.
- No new dependencies.
- Do not modify runtime state files or config formats.
- Biome formatting + import organization; prettier for web-react files (`npm run format` in `src/web-react`).
- Tests: pure logic, inline fixtures, no network / no live RPC / no real wallets.

---

### Task 1: vitest alias config + agent server module + payload tests

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/web-react/app/lib/server/agent.server.ts`
- Test: `test/web-react-agent-page.test.ts`

**Interfaces:**
- Produces: `AgentPayload`, `AgentStateSummary`, `CyclePoint`, `buildAgentPayload(journal, state, narrative, rawAction, page): AgentPayload`, `fetchAgent(page, rawAction): AgentPayload`.

`AgentPayload` shape (all success fields optional, matching `PortfolioPayload` convention — component asserts with `data.x!`):

```ts
{
  ok: boolean;
  error?: string;
  filter?: JournalFilter;
  state?: AgentStateSummary;          // enabled, running, lastCycleAt, llmStatus, cycle
  stats?: AgentStats;                 // from @vexis/web/pages/agent.js
  narrative?: NarrativeResult;        // from @vexis/web/agent-narrative.js
  total?: number;
  page?: number;
  pages?: number;
  chart?: readonly CyclePoint[];      // { cycle, open, tp, sl, close }
  groups?: readonly TimelineGroup[];  // from @vexis/web/pages/agent.js
}
```

- [ ] **Step 1: Add path aliases to root vitest config**

Modify `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@vexis": fileURLToPath(new URL("./src", import.meta.url)),
			"~": fileURLToPath(new URL("./src/web-react/app", import.meta.url)),
		},
	},
	test: {
		include: ["test/**/*.test.ts", "src/**/*.test.ts"],
		globals: false,
	},
});
```

- [ ] **Step 2: Write the failing test**

Create `test/web-react-agent-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAgentPayload } from "../src/web-react/app/lib/server/agent.server.js";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";

const mkCandidate = (
	over: Partial<JournalCandidate> = {},
): JournalCandidate => ({
	pool: "poolA",
	poolName: "Token/SOL",
	heuristicScore: 80,
	rationale: "solid",
	action: "open",
	guardrail: "pass",
	blockedReason: null,
	execution: "ok",
	txSignature: "sig1",
	...over,
});

const mkEntry = (
	cycle: number,
	candidates: JournalCandidate[],
): AgentJournalEntry => ({
	ts: "2026-08-12T10:00:00.000Z",
	cycle,
	llmStatus: "ok",
	candidates,
});

const mkState = (): AgentState => ({
	enabled: true,
	running: true,
	lastCycleAt: "2026-08-12T10:00:00.000Z",
	llmStatus: "ok",
	cycle: 42,
	plans: [],
	executions: [],
	cooldowns: [],
});

describe("buildAgentPayload", () => {
	it("assembles stats, filter, pagination and chart from fixture journal", () => {
		const journal = [
			mkEntry(1, [mkCandidate({ action: "open" })]),
			mkEntry(2, [
				mkCandidate({ action: "tp" }),
				mkCandidate({ action: "sl" }),
			]),
			mkEntry(3, [
				mkCandidate({ action: "open", guardrail: "blocked", execution: null }),
			]),
		];
		const payload = buildAgentPayload(journal, mkState(), {
			text: "ringkasan",
			source: "llm",
		}, "all", 1);

		expect(payload.ok).toBe(true);
		expect(payload.filter).toBe("all");
		expect(payload.stats?.cycles).toBe(3);
		expect(payload.stats?.opens).toBe(2);
		expect(payload.stats?.blocked).toBe(1);
		expect(payload.total).toBe(4);
		expect(payload.page).toBe(1);
		expect(payload.pages).toBe(1);
		expect(payload.state?.running).toBe(true);
		expect(payload.narrative?.text).toBe("ringkasan");
		expect(payload.groups).toHaveLength(3);
		expect(payload.chart?.[2]).toEqual({ cycle: 3, open: 0, tp: 0, sl: 0, close: 0 });
	});

	it("filters by action and clamps out-of-range pages", () => {
		const journal = Array.from({ length: 45 }, (_, i) =>
			mkEntry(i + 1, [
				mkCandidate({ action: i % 3 === 0 ? "tp" : "open" }),
			]),
		);
		const payload = buildAgentPayload(
			journal,
			mkState(),
			{ text: "x", source: "fallback" },
			"tp",
			99,
		);
		expect(payload.filter).toBe("tp");
		expect(payload.total).toBe(15);
		expect(payload.pages).toBe(1);
		expect(payload.page).toBe(1);
		expect(payload.groups).toHaveLength(15);
	});

	it("parses invalid filter as all and handles empty journal", () => {
		const payload = buildAgentPayload(
			[],
			mkState(),
			{ text: "", source: "fallback" },
			"bogus",
			1,
		);
		expect(payload.filter).toBe("all");
		expect(payload.ok).toBe(true);
		expect(payload.total).toBe(0);
		expect(payload.groups).toEqual([]);
		expect(payload.chart).toEqual([]);
		expect(payload.stats?.cycles).toBe(0);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/web-react-agent-page.test.ts`
Expected: FAIL — module `../src/web-react/app/lib/server/agent.server.js` not found.

- [ ] **Step 4: Write the server module**

Create `src/web-react/app/lib/server/agent.server.ts`:

```ts
import "~/lib/server/env.server";

import { join } from "node:path";
import type { AgentJournalEntry } from "@vexis/telegram/agent/journal.js";
import { readJournalAll } from "@vexis/telegram/agent/journal.js";
import type { AgentState } from "@vexis/telegram/agent/state.js";
import { loadState } from "@vexis/telegram/agent/state.js";
import {
	type NarrativeResult,
	narrativeSnapshot,
} from "@vexis/web/agent-narrative.js";
import {
	JOURNAL_PAGE_SIZE,
	type AgentStats,
	type JournalFilter,
	type TimelineGroup,
	agentStats,
	journalRows,
	paginate,
	parseJournalFilter,
	timelineGroups,
} from "@vexis/web/pages/agent.js";
import { repoRoot } from "./env.server";

export interface AgentStateSummary {
	readonly enabled: boolean;
	readonly running: boolean;
	readonly lastCycleAt: string | null;
	readonly llmStatus: "ok" | "failed" | "skipped";
	readonly cycle: number;
}

export interface CyclePoint {
	readonly cycle: number;
	readonly open: number;
	readonly tp: number;
	readonly sl: number;
	readonly close: number;
}

export interface AgentPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly filter?: JournalFilter;
	readonly state?: AgentStateSummary;
	readonly stats?: AgentStats;
	readonly narrative?: NarrativeResult;
	readonly total?: number;
	readonly page?: number;
	readonly pages?: number;
	readonly chart?: readonly CyclePoint[];
	readonly groups?: readonly TimelineGroup[];
}

export function buildAgentPayload(
	journal: readonly AgentJournalEntry[],
	state: AgentState,
	narrative: NarrativeResult,
	rawAction: string | null,
	page: number,
): AgentPayload {
	const filter = parseJournalFilter(rawAction);
	const stats = agentStats(journal);
	const rows = journalRows(journal, filter);
	const paged = paginate(rows, page, JOURNAL_PAGE_SIZE);
	const chart = journal.slice(-12).map((entry) => ({
		cycle: entry.cycle,
		open: entry.candidates.filter(
			(c) => c.action === "open" && c.execution === "ok",
		).length,
		tp: entry.candidates.filter(
			(c) => c.action === "tp" && c.execution === "ok",
		).length,
		sl: entry.candidates.filter(
			(c) => c.action === "sl" && c.execution === "ok",
		).length,
		close: entry.candidates.filter(
			(c) => c.action === "close" && c.execution === "ok",
		).length,
	}));
	return {
		ok: true,
		filter,
		state: {
			enabled: state.enabled,
			running: state.running,
			lastCycleAt: state.lastCycleAt,
			llmStatus: state.llmStatus,
			cycle: state.cycle,
		},
		stats,
		narrative,
		total: paged.total,
		page: paged.page,
		pages: paged.pages,
		chart,
		groups: timelineGroups(paged.rows),
	};
}

export function fetchAgent(
	page: number,
	rawAction: string | null,
): AgentPayload {
	const root = repoRoot();
	const journal = readJournalAll(join(root, ".vexis-agent-journal.jsonl"));
	const state = loadState(join(root, ".vexis-agent.json"));
	const narrative = narrativeSnapshot(
		journal,
		Date.now(),
		join(root, ".vexis-agent-narrative.json"),
	);
	return buildAgentPayload(journal, state, narrative, rawAction, page);
}
```

Note: `repoRoot()` returns `join(process.cwd(), "..", "..")` — correct when the web-react dev server runs with cwd `src/web-react`. `fetchAgent` is not unit-tested (file I/O); `buildAgentPayload` is the pure tested surface.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/web-react-agent-page.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run full root test suite to confirm no regression**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/web-react/app/lib/server/agent.server.ts test/web-react-agent-page.test.ts
git commit -m "feat(web-react): agent server module with payload builder and tests"
```

---

### Task 2: status banner + stat cards + narrative card

**Files:**
- Create: `src/web-react/app/components/agent/status-banner.tsx`
- Create: `src/web-react/app/components/agent/stat-cards.tsx`
- Create: `src/web-react/app/components/agent/narrative-card.tsx`

**Interfaces:**
- Consumes: `AgentStateSummary` (`~/lib/server/agent.server`), `AgentStats` (`@vexis/web/pages/agent.js` — type-only), `NarrativeResult` (`@vexis/web/agent-narrative.js` — type-only), `tsLocal` (`~/lib/format`).
- Produces:
  - `StatusBanner({ state }: { state: AgentStateSummary })`
  - `StatCards({ stats }: { stats: AgentStats })`
  - `NarrativeCard({ narrative, stats }: { narrative: NarrativeResult; stats: AgentStats })`

- [ ] **Step 1: Create `status-banner.tsx`**

```tsx
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { tsLocal } from "~/lib/format";
import type { AgentStateSummary } from "~/lib/server/agent.server";
import { cn } from "~/lib/utils";

export function StatusBanner({ state }: { state: AgentStateSummary }) {
	const running = state.running;
	return (
		<Card className="mx-4 overflow-hidden lg:mx-6">
			<CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
				<div className="flex items-center gap-3">
					<span className="relative flex size-2.5">
						{running && (
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						)}
						<span
							className={cn(
								"relative inline-flex size-2.5 rounded-full",
								running ? "bg-emerald-500" : "bg-muted-foreground",
							)}
						/>
					</span>
					<div>
						<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Automation engine
						</p>
						<h2 className="text-lg leading-tight font-semibold">
							{running ? "Agent is running" : "Agent is stopped"}
						</h2>
						<p className="text-sm text-muted-foreground">
							{state.lastCycleAt
								? `Last cycle completed ${tsLocal(state.lastCycleAt)}`
								: "No cycles recorded yet"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge
						variant={state.llmStatus === "failed" ? "destructive" : "outline"}
					>
						{state.llmStatus === "failed" ? "LLM FAILED" : "LLM OK"}
					</Badge>
					<Badge variant={running ? "default" : "outline"}>
						{running ? "LIVE" : "STOPPED"}
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Create `stat-cards.tsx`**

```tsx
import {
	BanIcon,
	CircleCheckBigIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	TargetIcon,
	TrophyIcon,
} from "lucide-react";
import type { AgentStats } from "@vexis/web/pages/agent.js";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";

const ICONS = {
	cycles: RefreshCwIcon,
	opens: TrophyIcon,
	blocked: BanIcon,
	rate: TargetIcon,
	tp: CircleCheckBigIcon,
	sl: ShieldAlertIcon,
};

export function StatCards({ stats }: { stats: AgentStats }) {
	const cards = [
		{
			key: "cycles",
			label: "Cycles",
			value: stats.cycles,
			sub: `cycle ${stats.cycles}`,
		},
		{
			key: "opens",
			label: "Opens",
			value: stats.opens,
			sub: `${stats.successRate}% of decisions`,
		},
		{
			key: "blocked",
			label: "Blocked",
			value: stats.blocked,
			sub: "guardrail prevented",
		},
		{
			key: "rate",
			label: "Success rate",
			value: `${stats.successRate}%`,
			sub: "open decision rate",
		},
		{ key: "tp", label: "Take profit", value: stats.tp, sub: "target hit" },
		{ key: "sl", label: "Stop loss", value: stats.sl, sub: "risk cut" },
	];
	return (
		<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-6 dark:*:data-[slot=card]:bg-card">
			{cards.map((card) => {
				const Icon = ICONS[card.key as keyof typeof ICONS];
				return (
					<Card key={card.key} className="@container/card">
						<CardHeader>
							<CardDescription className="flex items-center gap-1.5">
								<Icon className="size-3.5" />
								{card.label}
							</CardDescription>
							<CardTitle className="text-2xl font-semibold tabular-nums">
								{card.value}
							</CardTitle>
						</CardHeader>
						<CardFooter className="mt-auto">
							<span className="text-xs text-muted-foreground">{card.sub}</span>
						</CardFooter>
					</Card>
				);
			})}
		</div>
	);
}
```

Note: icon keys must exist in `lucide-react`. If `BanIcon`/`CircleCheckBigIcon` are unavailable in the installed version, substitute `ShieldOffIcon`/`BadgeCheckIcon` — verify against the package before finalizing.

- [ ] **Step 3: Create `narrative-card.tsx`**

```tsx
import type { NarrativeResult } from "@vexis/web/agent-narrative.js";
import type { AgentStats } from "@vexis/web/pages/agent.js";
import { Badge } from "~/components/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";

export function NarrativeCard({
	narrative,
	stats,
}: {
	narrative: NarrativeResult;
	stats: AgentStats;
}) {
	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<div>
					<CardTitle>Decision context</CardTitle>
					<p className="text-sm text-muted-foreground">Latest run briefing</p>
				</div>
				<Badge variant={narrative.source === "llm" ? "default" : "outline"}>
					{narrative.source === "llm" ? "GENERATED" : "FALLBACK"}
				</Badge>
			</CardHeader>
			<CardContent>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{narrative.text}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<Badge variant={stats.blocked > 0 ? "destructive" : "outline"}>
						{stats.blocked} blocked
					</Badge>
					<span>Read-only journal analysis</span>
				</div>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 4: Typecheck the web-react app**

Run (from `src/web-react`): `npm run typecheck`
Expected: PASS (route still references the old placeholder components, which still exist — no new errors introduced).

- [ ] **Step 5: Commit**

```bash
git add src/web-react/app/components/agent/status-banner.tsx src/web-react/app/components/agent/stat-cards.tsx src/web-react/app/components/agent/narrative-card.tsx
git commit -m "feat(web-react): agent status banner, stat cards, narrative card"
```

---

### Task 3: cycle chart

**Files:**
- Create: `src/web-react/app/components/agent/cycle-chart.tsx`

**Interfaces:**
- Consumes: `CyclePoint` (`~/lib/server/agent.server` — type-only), `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`ChartConfig` (`~/components/ui/chart`), recharts.
- Produces: `CycleChart({ data }: { data: readonly CyclePoint[] })`.

- [ ] **Step 1: Create `cycle-chart.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import type { CyclePoint } from "~/lib/server/agent.server";

const chartConfig = {
	open: { label: "Open", color: "var(--chart-1)" },
	tp: { label: "TP", color: "var(--chart-2)" },
	sl: { label: "SL", color: "var(--chart-3)" },
	close: { label: "Close", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function CycleChart({ data }: { data: readonly CyclePoint[] }) {
	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle>Decisions per cycle</CardTitle>
				<p className="text-sm text-muted-foreground">
					Successful executions — last {data.length} cycles
				</p>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
						No cycles recorded yet.
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-64 w-full">
						<BarChart accessibilityLayer data={data as unknown as object[]}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="cycle"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={20}
								allowDecimals={false}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Bar dataKey="open" stackId="a" fill="var(--color-open)" />
							<Bar dataKey="tp" stackId="a" fill="var(--color-tp)" />
							<Bar dataKey="sl" stackId="a" fill="var(--color-sl)" />
							<Bar
								dataKey="close"
								stackId="a"
								fill="var(--color-close)"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
```

Note: verify `ChartContainer` accepts `data as object[]` (check `chart.tsx` prop types). If `BarChart` data typing is incompatible, cast to the recharts-expected array type.

- [ ] **Step 2: Typecheck**

Run (from `src/web-react`): `npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/components/agent/cycle-chart.tsx
git commit -m "feat(web-react): agent decisions-per-cycle stacked bar chart"
```

---

### Task 4: decision journal

**Files:**
- Create: `src/web-react/app/components/agent/decision-journal.tsx`

**Interfaces:**
- Consumes: `JournalCandidate` (`@vexis/telegram/agent/journal.js` — type-only), `JournalFilter`, `TimelineGroup` (`@vexis/web/pages/agent.js` — type-only), `Badge`/`Button`/`Card`/`Tabs`/`Tooltip` (`~/components/ui/*`), `shortAddr`, `solscanUrl`, `tsLocal` (`~/lib/format`).
- Produces: `DecisionJournal({ filter, page, pages, total, groups, onFilterChange, onPageChange })` with types `{ filter: JournalFilter; page: number; pages: number; total: number; groups: readonly TimelineGroup[]; onFilterChange: (f: string) => void; onPageChange: (p: number) => void }`.

- [ ] **Step 1: Create `decision-journal.tsx`**

```tsx
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ExternalLinkIcon,
} from "lucide-react";
import type { JournalCandidate } from "@vexis/telegram/agent/journal.js";
import type { JournalFilter, TimelineGroup } from "@vexis/web/pages/agent.js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { shortAddr, solscanUrl, tsLocal } from "~/lib/format";

const FILTER_TABS: { value: JournalFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "hold", label: "Hold" },
	{ value: "tp", label: "TP" },
	{ value: "sl", label: "SL" },
	{ value: "close", label: "Close" },
	{ value: "blocked", label: "Blocked" },
];

const PAGE_SIZE = 20;

function actionVariant(
	action: JournalCandidate["action"],
): "default" | "secondary" | "destructive" | "outline" {
	switch (action) {
		case "open":
			return "default";
		case "hold":
			return "outline";
		case "tp":
			return "secondary";
		case "sl":
			return "destructive";
		case "close":
			return "secondary";
	}
}

function CandidateRow({ candidate }: { candidate: JournalCandidate }) {
	const blocked = candidate.guardrail === "blocked";
	return (
		<div className="flex flex-col gap-1 py-2 pl-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="font-medium text-sm">
					{candidate.poolName || candidate.pool}
				</span>
				<Badge variant={actionVariant(candidate.action)}>
					{candidate.action}
				</Badge>
				<Badge variant={blocked ? "destructive" : "outline"}>
					{blocked ? "BLOCKED" : "PASS"}
				</Badge>
				{candidate.execution === "failed" ? (
					<Badge variant="destructive">FAILED</Badge>
				) : candidate.execution === "ok" && candidate.txSignature ? (
					<a
						href={solscanUrl(candidate.txSignature)}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
					>
						{shortAddr(candidate.txSignature)}
						<ExternalLinkIcon className="size-3" />
					</a>
				) : null}
			</div>
			{candidate.rationale ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<p className="line-clamp-1 cursor-help text-xs text-muted-foreground">
							{candidate.rationale}
						</p>
					</TooltipTrigger>
					<TooltipContent className="max-w-sm">
						{candidate.rationale}
					</TooltipContent>
				</Tooltip>
			) : null}
			{candidate.blockedReason ? (
				<p className="text-xs text-destructive">{candidate.blockedReason}</p>
			) : null}
		</div>
	);
}

export function DecisionJournal({
	filter,
	page,
	pages,
	total,
	groups,
	onFilterChange,
	onPageChange,
}: {
	filter: JournalFilter;
	page: number;
	pages: number;
	total: number;
	groups: readonly TimelineGroup[];
	onFilterChange: (f: string) => void;
	onPageChange: (p: number) => void;
}) {
	const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
	const to = Math.min(page * PAGE_SIZE, total);
	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Decision Journal</CardTitle>
					<p className="text-sm text-muted-foreground">{total} entries</p>
				</div>
				<Tabs value={filter} onValueChange={onFilterChange}>
					<TabsList>
						{FILTER_TABS.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value}>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{groups.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No journal entries
						{filter !== "all" ? ` matching filter "${filter}"` : ""}.
					</div>
				) : (
					<div className="divide-y divide-border">
						{groups.map((group) => (
							<div key={group.cycle} className="px-4 py-2">
								<div className="flex flex-wrap items-center gap-2 py-1">
									<span className="font-mono text-xs font-semibold">
										#{group.cycle}
									</span>
									{group.llmStatus === "failed" ? (
										<Badge variant="destructive">LLM FAILED</Badge>
									) : null}
									<span className="text-xs text-muted-foreground">
										{tsLocal(group.ts)}
									</span>
								</div>
								<div className="border-l pl-3">
									{group.rows.length === 0 ? (
										<p className="py-2 text-xs text-muted-foreground">
											No candidates
										</p>
									) : (
										group.rows.map((row, i) =>
											row.candidate === null ? (
												<p
													key={i}
													className="py-2 text-xs text-muted-foreground"
												>
													No candidates
												</p>
											) : (
												<CandidateRow key={i} candidate={row.candidate} />
											),
										)
									)}
								</div>
							</div>
						))}
					</div>
				)}
				{total > 0 ? (
					<div className="flex items-center justify-between px-4 py-3">
						<span className="text-sm text-muted-foreground">
							Showing {from}–{to} of {total}
						</span>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => onPageChange(page - 1)}
							>
								<ChevronLeftIcon />
								Prev
							</Button>
							<span className="text-sm tabular-nums">
								Page {page} of {pages}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= pages}
								onClick={() => onPageChange(page + 1)}
							>
								Next
								<ChevronRightIcon />
							</Button>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
```

Note: `Tooltip` requires `TooltipProvider` — already mounted in `app/root.tsx`. The `line-clamp-1` utility is Tailwind core. The `divide-y` divider is a Tailwind v4 core utility; if unavailable, replace with `border-b border-border` per group.

- [ ] **Step 2: Typecheck**

Run (from `src/web-react`): `npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/components/agent/decision-journal.tsx
git commit -m "feat(web-react): agent decision journal timeline with filters and pagination"
```

---

### Task 5: agent page composition

**Files:**
- Create: `src/web-react/app/components/agent/agent-page.tsx`

**Interfaces:**
- Consumes: `AgentPayload` (`~/lib/server/agent.server` — type-only), `StatusBanner`, `StatCards`, `NarrativeCard`, `CycleChart`, `DecisionJournal`, `DashboardShell`, `Card`/`Button` ui components, `useLoaderData`/`useRevalidator`/`useSearchParams`.
- Produces: `AgentPage` (default export referenced by `routes/agent.tsx`).

- [ ] **Step 1: Create `agent-page.tsx`**

```tsx
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import {
	useLoaderData,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import type { AgentPayload } from "~/lib/server/agent.server";
import { CycleChart } from "./cycle-chart";
import { DecisionJournal } from "./decision-journal";
import { NarrativeCard } from "./narrative-card";
import { StatCards } from "./stat-cards";
import { StatusBanner } from "./status-banner";

const REFRESH_MS = 30_000;

export function AgentPage() {
	const data = useLoaderData<AgentPayload>();
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) revalidate();
		}, REFRESH_MS);
		const onVisibility = () => {
			if (!document.hidden) revalidate();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [revalidate]);

	const onFilterChange = (value: string) =>
		setSearchParams(value === "all" ? {} : { action: value });
	const onPageChange = (next: number) => {
		const params: Record<string, string> = {};
		if (data.filter && data.filter !== "all") params.action = data.filter;
		if (next > 1) params.page = String(next);
		setSearchParams(params);
	};

	return (
		<DashboardShell title="Agent">
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
					<h1 className="text-2xl font-bold tracking-tight">Agent Console</h1>
					<Button
						variant="outline"
						size="sm"
						onClick={() => revalidate()}
						disabled={state === "loading"}
					>
						<RefreshCwIcon
							className={state === "loading" ? "animate-spin" : ""}
						/>
						Refresh
					</Button>
				</div>

				{!data.ok ? (
					<Card className="mx-4 lg:mx-6">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircleIcon className="size-5" />
								Failed to load agent
							</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							{data.error ?? "Unknown error"} — check the backend connection and
							try refreshing.
						</CardContent>
					</Card>
				) : (
					<>
						<StatusBanner state={data.state!} />
						<StatCards stats={data.stats!} />
						<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
							<NarrativeCard
								narrative={data.narrative!}
								stats={data.stats!}
							/>
							<CycleChart data={data.chart!} />
						</div>
						<DecisionJournal
							filter={data.filter!}
							page={data.page!}
							pages={data.pages!}
							total={data.total!}
							groups={data.groups!}
							onFilterChange={onFilterChange}
							onPageChange={onPageChange}
						/>
					</>
				)}
			</div>
		</DashboardShell>
	);
}
```

- [ ] **Step 2: Typecheck**

Run (from `src/web-react`): `npm run typecheck`
Expected: PASS (no new errors; route still uses old placeholder until Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/components/agent/agent-page.tsx
git commit -m "feat(web-react): agent page composition with auto-refresh"
```

---

### Task 6: wire the route

**Files:**
- Modify: `src/web-react/app/routes/agent.tsx` (full rewrite)

**Interfaces:**
- Consumes: `AgentPage` (`~/components/agent/agent-page`), `fetchAgent(page, rawAction): AgentPayload` (`~/lib/server/agent.server`), `getWebPassword` (`~/lib/server/portfolio.server`), `hasValidSession` (`~/lib/server/session.server`).
- Produces: `loader` returning `AgentPayload`; default export = `AgentPage`.

- [ ] **Step 1: Rewrite the route**

Replace the entire content of `src/web-react/app/routes/agent.tsx`:

```tsx
import { redirect } from "react-router";
import { AgentPage } from "~/components/agent/agent-page";
import { fetchAgent } from "~/lib/server/agent.server";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/agent";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	const url = new URL(request.url);
	const rawPage = url.searchParams.get("page");
	const parsedPage = rawPage === null ? 1 : Number(rawPage);
	const page =
		Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	return fetchAgent(page, url.searchParams.get("action"));
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	return serverLoader();
}

export default AgentPage;
```

Note: `fetchAgent` (sync) returns `AgentPayload`; the loader wraps it in a Promise implicitly (async function). The old imports of `SectionCards`, `ChartAreaInteractive`, `DataTable`, `dashboard/data.json` are removed.

- [ ] **Step 2: Confirm no client-bundle pollution**

Verify the route imports only `~/components/agent/agent-page` (client component) plus `*.server.ts` modules. No `@vexis/*` value imports in the route file itself.

- [ ] **Step 3: Confirm placeholder demo components are now unused by routes**

Run: `rg -l "SectionCards|ChartAreaInteractive|DataTable|dashboard/data" src/web-react/app`
Expected: matches only `section-cards.tsx`, `chart-area-interactive.tsx`, `data-table.tsx` themselves (and `dashboard/data.json`). Leave them in place as reusable demo scaffolding unless the user asks to remove them.

- [ ] **Step 4: Typecheck + build**

Run (from `src/web-react`):
```bash
npm run typecheck
npm run build
```
Expected: PASS with no errors; build succeeds with no `node:fs` leakage errors in the client bundle.

- [ ] **Step 5: Biome check**

Run (repo root): `npm run check`
Expected: formatting/imports pass (command writes fixes if needed).

- [ ] **Step 6: Root tests**

Run (repo root): `npm test`
Expected: all tests pass, including the new `test/web-react-agent-page.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/web-react/app/routes/agent.tsx
git commit -m "feat(web-react): wire agent route to the new agent page"
```

---

### Task 7: verification

- [ ] **Step 1: Full verification**

Run, in order:
```bash
npm run check
npm test
```
and from `src/web-react`:
```bash
npm run typecheck
npm run build
```
Expected: all pass.

Note: repo-root `npm run typecheck` fails on committed `src/web-react/**` files (root tsconfig lacks JSX/alias config) — this is pre-existing and NOT introduced by this work; verify against the same command before starting (baseline already fails).

- [ ] **Step 2: Manual smoke test**

Run (from `src/web-react`): `npm run dev`, open `/agent`. Verify:
- Status banner shows running/stopped + live badge + last cycle.
- Stat cards render the six metrics.
- Narrative card shows briefing text + GENERATED/FALLBACK badge.
- Cycle chart renders stacked bars; empty state when journal empty.
- Decision journal: filter tabs re-fetch, pagination prev/next works, blocked/failed badges and Solscan links render.
- Refresh button + auto-refresh (30s) update data.
- Empty journal shows friendly empty states.

- [ ] **Step 3: Final commit (if any stragglers)**

```bash
git status
git add <any uncommitted intended files>
git commit -m "chore(web-react): finalize agent page"
```