# Agent Page (React Web) — Design

Date: 2026-08-16

## Purpose

Replace the placeholder Agent page in `src/web-react/` (currently demo `data.json` cards) with a real, read-only Agent page that ports the functionality of the legacy `src/web/pages/agent.ts` onto the new React + shadcn UI. Theme follows the current React design system — the legacy look is not reused.

## Decisions

- Reuse existing runtime data files as-is: `.vexis-agent-journal.jsonl`, `.vexis-agent.json`, `.vexis-agent-narrative.json`. No schema changes.
- Reuse pure data helpers from the legacy page (`agentStats`, `journalRows`, `timelineGroups`, `paginate`, `parseJournalFilter`, `JOURNAL_FILTERS`, `JOURNAL_PAGE_SIZE`) and their types via `@vexis/web/pages/agent.js`. No re-implementation.
- Server-side filtering + pagination via query params (`action`, `page`), mirroring the ClosedTable pattern.
- Auto-refresh 30s + manual refresh, same as the portfolio page.
- All charts via `recharts` + existing `ChartContainer`.
- No new dependencies.

## Architecture

```
src/web-react/
└── app/
    ├── lib/server/agent.server.ts      # NEW — fetchAgent(page, filter): AgentPayload
    ├── routes/agent.tsx                # MODIFY — loader (auth + query parsing), render AgentPage
    └── components/agent/               # NEW
        ├── agent-page.tsx              # page composition: banner, stat cards, narrative + chart, journal
        ├── status-banner.tsx           # running/stopped, pulse dot, LIVE/STOPPED badge, last cycle
        ├── stat-cards.tsx              # Cycles, Opens, Blocked, Success rate, TP, SL
        ├── narrative-card.tsx          # LLM briefing, GENERATED/FALLBACK badge, source
        ├── cycle-chart.tsx             # stacked bar: open/tp/sl/close per cycle (recharts)
        └── decision-journal.tsx        # timeline grouped by cycle, Tabs filter, prev/next pagination
```

### Data flow

1. `loader(request)`: auth check (existing), parse `action` via `parseJournalFilter`, parse `page`, call `fetchAgent(page, filter)`.
2. `fetchAgent` reads journal (`readJournalAll` with repo-root path), state (`loadState`), narrative (`narrativeSnapshot`), computes stats + filtered rows + pagination.
3. `clientLoader` forwards `serverLoader()`; page auto-refreshes like portfolio.

### AgentPayload

```ts
{
  ok: boolean;
  error?: string;
  state: { enabled, running, lastCycleAt, llmStatus, cycle };
  stats: AgentStats;                              // cycles, opens, holds, blocked, tp, sl, closes, failed, successRate
  narrative: { text: string; source: "llm" | "fallback" };
  total: number;                                   // filtered row count
  page: number;
  pages: number;
  groups: TimelineGroup[];                         // paginated rows grouped by cycle
}
```

## Components

### Status banner
Card with pulse dot + status text ("Agent is running/stopped"), LIVE/STOPPED badge, "Last cycle completed …" via `tsLocal`, LLM status badge on failure.

### Stat cards
Grid (responsive like `StatCards`): Cycles, Opens, Blocked, Success rate, Take profit, Stop loss. Lucide icons, tabular numbers.

### Narrative card
"Decision context" panel: briefing text from `narrativeSnapshot`, badge GENERATED (llm) or FALLBACK (fallback), muted note "Read-only journal analysis". Empty journal → friendly fallback text.

### Cycle chart
Stacked bar chart of last N cycles: open / tp / sl / close counts (successful executions only), using `ChartContainer` + `recharts`. Color mapping mirrors legacy (`emerald`, `amber`, `red`, `blue`).

### Decision journal
- Filter via `Tabs` (All/Open/Hold/TP/SL/Close/Blocked) with count badges — pattern from positions-table.
- Timeline grouped per cycle: header `#cycle` + timestamp + LLM-failed marker; each candidate row: pool name, action badge, guardrail badge (pass/blocked), execution text (failed badge or Solscan tx link), rationale text, blocked reason.
- Empty cycle row ("no candidates") preserved from legacy.
- Pagination prev/next with "showing X–Y of Z" (pattern from closed-table).
- Empty state when no journal entries.

## Error handling

- `ok: false` → error card with message + retry (refresh) hint, same pattern as portfolio.
- Missing data files → treated as empty journal/state (existing read functions already return defaults).
- No crashes on malformed journal lines (existing `readJournalAll` already skips them).

## Testing

`test/web-react-agent-page.test.ts` — pure logic only, inline fixtures, no network:

- `fetchAgent`-level helper functions if any pure logic is extracted (stat/filter/pagination behavior already covered by legacy tests and reused — assert payload shape with fixture journal).
- If the server module keeps logic inline, cover the route-level parsing and payload building with a small fixture (journal + state files on temp paths), asserting stats, filtered groups, pagination.
- Guardrail/action badge mapping helpers (if extracted) — fixture-driven.

No live RPC / Telegram / Meteora / wallet access in tests.

## Verification

- `npm run check` (biome) and `npm run typecheck` in `src/web-react` (react-router typegen + tsc).
- Root `npm test` must pass.
- Manual: `npm run dev` in `src/web-react`, open `/agent`, verify status, stats, narrative, chart, filters, pagination, empty state, refresh.

## Out of scope

- On-chain actions (read-only by design).
- LLM regeneration from the UI (narrative comes from existing cached/fallback path).
- Legacy `src/web/` removal — out of scope for this task.