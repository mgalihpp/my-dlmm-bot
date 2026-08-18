# Web UI — Close Position On-chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side, authenticated "Close & Zap Out" action per open position in the Portfolio web UI, with a confirmation dialog.

**Architecture:** A new Effect-based server module (`close.server.ts`) runs `Zap.closeAndZapOut` through the existing `AppLayer`, records a manual-close cooldown, and returns the transaction signature. A React Router `action` on `/portfolio` (already protected by `authMiddleware`) invokes it. The UI adds a Close button per position in both the table and card views, wired to a confirmation `Sheet` that posts via `useFetcher`.

**Tech Stack:** TypeScript, Effect, React Router 8, shadcn/ui (`Sheet`, `Button`), Tailwind 4, Vitest.

## Global Constraints

- ESM-only; use `.js` extensions in local imports.
- Effect-first: prefer `Effect` over throwing; use `Effect.catchAll` + `errorMessage`.
- Decode/validate all untrusted input (formData).
- Never expose or send private keys to the client — all on-chain work is server-side.
- Reuse existing components from `src/web-react/app/components/ui/`.
- No new dependencies.
- After changes run: `npm run check`, `npm run typecheck`, `npm test`, and in `src/web-react/`: `npm run typecheck`, `npm run format`.
- Follow the existing `PortfolioPayload`/`CloseResult` `{ ok, error? }` result-shape convention.

---

## Task 1: Server close module + pure logic tests

**Files:**
- Create: `src/web-react/app/lib/server/close.server.ts`
- Test: `test/web-react-close.test.ts`

**Interfaces:**
- Consumes: `Zap` service (`@vexis/services/Zap.js`), `AppLayer` (`@vexis/layers.js`), `errorMessage` (`@vexis/errors.js`), `recordManualClose` (`../../../../telegram/agent/manual-close.js`).
- Produces:
  - `type CloseResult = { ok: true; sig: string } | { ok: false; error: string }`
  - `function validateCloseInput(pool: string, position: string): string | null`
  - `function pickCloseSig(result: { closeSig?: string; zapSig?: string }): string`
  - `function closePosition(pool: string, position: string): Promise<CloseResult>`

- [ ] **Step 1: Write the failing tests**

Create `test/web-react-close.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	pickCloseSig,
	validateCloseInput,
} from "../src/web-react/app/lib/server/close.server.js";

describe("validateCloseInput", () => {
	it("returns null when both pool and position are present", () => {
		expect(validateCloseInput("pool1", "pos1")).toBeNull();
	});
	it("returns an error when pool or position is missing/empty", () => {
		expect(validateCloseInput("", "pos1")).toBe("pool and position are required");
		expect(validateCloseInput("pool1", "")).toBe("pool and position are required");
		expect(validateCloseInput("pool1", "  ")).toBe("pool and position are required");
	});
});

describe("pickCloseSig", () => {
	it("prefers zapSig over closeSig", () => {
		expect(pickCloseSig({ closeSig: "close", zapSig: "zap" })).toBe("zap");
	});
	it("falls back to closeSig", () => {
		expect(pickCloseSig({ closeSig: "close" })).toBe("close");
	});
	it("returns empty string when neither is present", () => {
		expect(pickCloseSig({})).toBe("");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/web-react-close.test.ts`
Expected: FAIL — module not found (`close.server.js`).

- [ ] **Step 3: Create `close.server.ts`**

```ts
import { Effect } from "effect";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { Zap } from "@vexis/services/Zap.js";
import { recordManualClose } from "../../../../telegram/agent/manual-close.js";

export type CloseResult = { ok: true; sig: string } | { ok: false; error: string };

export function validateCloseInput(pool: string, position: string): string | null {
	if (!pool.trim() || !position.trim()) {
		return "pool and position are required";
	}
	return null;
}

export function pickCloseSig(result: {
	closeSig?: string;
	zapSig?: string;
}): string {
	return result.zapSig || result.closeSig || "";
}

export function closePosition(pool: string, position: string): Promise<CloseResult> {
	const invalid = validateCloseInput(pool, position);
	if (invalid) return Promise.resolve({ ok: false, error: invalid });

	const program = Effect.gen(function* () {
		const zap = yield* Zap;
		const res = yield* zap.closeAndZapOut(pool, position);
		const sig = pickCloseSig(res);
		if (!sig) throw new Error("Close produced no transaction signature");
		yield* Effect.promise(() =>
			recordManualClose(() => null, pool, "", null),
		);
		return { ok: true, sig } as const;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({ ok: false, error: errorMessage(error) } as const),
		),
	);
	return Effect.runPromise(program);
}
```

Note: `recordManualClose` is invoked with `getRt: () => null` (no runtime agent in the web process) so the cooldown falls back to persisted agent state; `poolName`/`baseMint` are passed as empty/`null` — the pool address is the recorded key. This is a deliberate simplification (`ponytail: poolName empty; add a MeteoraApi lookup if the cooldown label must show the pair`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/web-react-close.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web-react/app/lib/server/close.server.ts test/web-react-close.test.ts
git commit -m "feat(web): add server-side close position action"
```

---

## Task 2: Route action on `/portfolio`

**Files:**
- Modify: `src/web-react/app/routes/portfolio.tsx`

**Interfaces:**
- Consumes: `closePosition`, `CloseResult` from `~/lib/server/close.server`.
- Produces: a `Route.ActionArgs` `action` returning `CloseResult` JSON on POST `op=close`.

- [ ] **Step 1: Add the `action` export**

Modify `src/web-react/app/routes/portfolio.tsx` to add the action (below the existing `loader`):

```ts
import { closePosition } from "~/lib/server/close.server";
import type { Route } from "./+types/portfolio";

export async function action({ request }: Route.ActionArgs) {
	const form = await request.formData();
	const op = String(form.get("op") ?? "");
	if (op !== "close") {
		return { ok: false, error: "Unknown op" } as const;
	}
	const pool = String(form.get("pool") ?? "");
	const position = String(form.get("position") ?? "");
	return closePosition(pool, position);
}
```

(Add the `closePosition` import to the existing imports in the file.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --prefix src/web-react`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/routes/portfolio.tsx
git commit -m "feat(web): add close position action to portfolio route"
```

---

## Task 3: Close button + confirmation Sheet in positions UI

**Files:**
- Modify: `src/web-react/app/components/portfolio/positions-table.tsx`

**Interfaces:**
- Consumes: `closePosition` return type `CloseResult` via `useFetcher`; `shortAddr`, `solscanUrl`, `pair` from `~/lib/format`; existing `Sheet`, `Button` components.
- Produces: `CloseConfirmSheet` component; `onClose(position)` props threaded into `PositionsDetail` and `PositionsCardDetail`.

- [ ] **Step 1: Add imports**

Add to the existing import block in `positions-table.tsx`:
- `useFetcher` from `"react-router"` (add to the existing react-router import).
- `AlertTriangleIcon` (or `CircleAlertIcon`) from `"lucide-react"`.
- `solscanUrl` is already imported; ensure `shortAddr`, `pair` are already imported (they are).

- [ ] **Step 2: Add the `CloseConfirmSheet` component**

Add this component near the other helper components (e.g. after `CopyButton`):

```tsx
function CloseConfirmSheet({
	target,
	poolName,
	onOpenChange,
}: {
	target: { pool: string; position: string } | null;
	poolName: string;
	onOpenChange: (open: boolean) => void;
}) {
	const fetcher = useFetcher<CloseResult>();
	const submitting = fetcher.state !== "idle";

	useEffect(() => {
		if (fetcher.data?.ok) toast.success("Position closed");
		else if (fetcher.data && !fetcher.data.ok)
			toast.error(fetcher.data.error ?? "Failed to close position");
	}, [fetcher.data]);

	return (
		<Sheet open={target !== null} onOpenChange={onOpenChange}>
			<SheetContent side="bottom" className="sm:!h-auto">
				<SheetHeader>
					<SheetTitle>Close &amp; Zap Out</SheetTitle>
					<SheetDescription>
						{poolName}
						{target ? ` · Position ${shortAddr(target.position, 6)}` : ""}
					</SheetDescription>
				</SheetHeader>
				<div className="space-y-4">
					<p className="flex items-start gap-2 text-sm text-muted-foreground">
						<AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
						Remove all liquidity, claim fees, then swap to SOL via Jupiter.
						This action is irreversible.
					</p>
					{fetcher.data?.ok && fetcher.data.sig ? (
						<div className="space-y-2 text-sm">
							<p className="font-medium text-emerald-500">Position closed</p>
							<a
								href={solscanUrl(fetcher.data.sig)}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono text-xs text-muted-foreground underline"
							>
								{shortAddr(fetcher.data.sig, 12)}
							</a>
						</div>
					) : (
						<fetcher.Form method="post" className="flex justify-end gap-2">
							<input type="hidden" name="op" value="close" />
							<input type="hidden" name="pool" value={target?.pool ?? ""} />
							<input
								type="hidden"
								name="position"
								value={target?.position ?? ""}
							/>
							<Button
								type="button"
								variant="outline"
								disabled={submitting}
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="destructive"
								disabled={submitting}
							>
								{submitting ? "Closing…" : "Close & Zap Out"}
							</Button>
						</fetcher.Form>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 3: Thread `onClose` into `PositionsCardDetail`**

Change signature `function PositionsCardDetail({ pool, currency, solPrice })` to add `onClose: (position: string) => void`. In the per-position header (the `div` at the top of the position block containing the address link + "Age" span), add a destructive Close button:

```tsx
<Button
	type="button"
	variant="outline"
	size="sm"
	className="h-7 px-2 text-xs"
	onClick={(e) => {
		e.stopPropagation();
		onClose(live.address);
	}}
>
	Close
</Button>
```

Place it in the flex row alongside the "Age" text.

- [ ] **Step 4: Thread `onClose` into `PositionsDetail`**

Change signature `function PositionsDetail({ pool })` to add `onClose: (position: string) => void`. In the first cell (the `Position / Range` cell containing the address link), add a small Close button after the address link:

```tsx
<Button
	type="button"
	variant="outline"
	size="sm"
	className="ml-2 h-6 px-2 text-xs"
	onClick={() => onClose(live.address)}
>
	Close
</Button>
```

- [ ] **Step 5: Wire state + render in `PositionsTableView`**

In the main component (`PositionsTableView`):
- Add state: `const [closeTarget, setCloseTarget] = useState<{ pool: string; position: string } | null>(null);`
- Pass `onClose` to both detail renderers. In the expanded table row: `<PositionsDetail pool={pool} onClose={(pos) => setCloseTarget({ pool: pool.poolAddress, position: pos })} />`. In the `selectedCard` sheet: `<PositionsCardDetail pool={selectedCard} currency={currency} solPrice={solPrice} onClose={(pos) => setCloseTarget({ pool: selectedCard.poolAddress, position: pos })} />`.
- After the existing `selectedCard` Sheet (closing `</Card>`), render:

```tsx
<CloseConfirmSheet
	target={closeTarget}
	poolName={
		closeTarget
			? pair(
					pools.find((p) => p.poolAddress === closeTarget.pool)?.tokenX ?? "",
					pools.find((p) => p.poolAddress === closeTarget.pool)?.tokenY ?? "",
				)
			: ""
	}
	onOpenChange={(open) => !open && setCloseTarget(null)}
/>
```

- [ ] **Step 6: Typecheck + format**

Run in `src/web-react/`: `npm run typecheck` then `npm run format`.
Expected: PASS; formatter normalizes files.

- [ ] **Step 7: Commit**

```bash
git add src/web-react/app/components/portfolio/positions-table.tsx
git commit -m "feat(web): add close position button and confirmation sheet"
```

---

## Task 4: Revisit the read-only dashboard constraint

**Files:**
- Modify: `AGENTS.md` (line 93)

**Interfaces:**
- None.

- [ ] **Step 1: Revise the read-only rule**

Replace the line:

```
- Keep the dashboard read-only — never expose on-chain controls or private keys.
```

with:

```
- Keep the dashboard read-only for data, and never expose private keys.
- The dashboard may expose authenticated on-chain actions (e.g. closing a
  position). Such actions run server-side only; the client sends only the
  target addresses and never keys.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: allow authenticated close-position action in web dashboard"
```

---

## Self-Review (run after all tasks)

- **Spec coverage:** Server module (Task 1), route action + auth (Task 2, route already has `authMiddleware`), UI button + confirm (Task 3), AGENTS.md revision (Task 4), error handling + validation (Task 1 `validateCloseInput` + `Effect.catchAll`), testing (Task 1). All spec sections covered.
- **Placeholder scan:** No TBD/TODO; every code step has concrete content.
- **Type consistency:** `CloseResult`, `validateCloseInput`, `pickCloseSig`, `closePosition` names match across Task 1 and Task 2/3. `onClose(position)` param name consistent in Task 3.
