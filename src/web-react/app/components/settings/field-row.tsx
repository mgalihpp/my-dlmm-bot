import { InfoIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useActionData, useSubmit } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import type { EditableField, SettingsPayload } from "~/lib/settings";

const HINTS: Record<string, { description: string; example: string }> = {
	wallet: {
		description:
			"The wallet address used to read balances and manage positions.",
		example: "7xK...3mP",
	},
	rpcUrl: {
		description: "The Solana RPC endpoint used for on-chain requests.",
		example: "https://api.mainnet-beta.solana.com",
	},
	"agent.enabled": {
		description: "Turns the autonomous liquidity agent on or off.",
		example: "On to let the agent manage positions",
	},
	"agent.intervalMinutes": {
		description: "How often the agent scans pools and open positions.",
		example: "15 minutes",
	},
	"agent.maxSolPerPosition": {
		description: "Maximum SOL the agent may allocate to one new position.",
		example: "0.5 SOL",
	},
	"agent.maxOpenPositions": {
		description: "Caps how many positions the agent can keep open at once.",
		example: "5 positions",
	},
	"create.strategy": {
		description:
			"Controls how liquidity is distributed across the price range.",
		example: "bidask",
	},
	"create.slippageBps": {
		description:
			"Maximum swap price movement allowed during position creation.",
		example: "50 bps = 0.5%",
	},
	"pools.minMcap": {
		description:
			"Filters out pools whose token market cap is below this value.",
		example: "100000 = $100k",
	},
	"pools.minTvl": {
		description:
			"Filters out pools with less total value locked than this amount.",
		example: "25000 = $25k",
	},
	"pools.solPairOnly": {
		description: "Limits pool discovery to pairs that include SOL.",
		example: "On",
	},
};

function fieldHint(field: EditableField): {
	description: string;
	example: string;
} {
	const hint = HINTS[field.path];
	if (hint) return hint;
	const name = `${field.path} ${field.label}`.toLowerCase();
	const example =
		field.type === "boolean"
			? "On or Off"
			: field.type === "enum"
				? (field.values ?? []).join(", ")
				: field.type === "list"
					? name.includes("launchpad")
						? "pump.fun, launchlab"
						: name.includes("amount")
							? "0.1, 0.25, 0.5"
							: "value1, value2"
					: field.type === "number"
						? numberExample(name)
						: name.includes("url")
							? "https://api.example.com"
							: name.includes("model")
								? "gpt-4o-mini"
								: name.includes("timeframe")
									? "24h"
									: "Enter a value";
	return {
		description: `Controls ${field.label.toLowerCase()} in the ${field.section} settings.`,
		example,
	};
}

function numberExample(name: string): string {
	if (name.includes("pct") || name.includes("percent")) return "5 (%)";
	if (name.includes("bps")) return "50 (0.5%)";
	if (name.includes("milliseconds") || name.includes("cooldown")) {
		return "30000 (30 seconds)";
	}
	if (name.includes("minutes")) return "15 minutes";
	if (name.includes("days")) return "7 days";
	if (name.includes("hours")) return "24 hours";
	if (name.includes("sol") || name.includes("amount")) return "0.5 SOL";
	if (name.includes("mcap")) return "100000 ($100k)";
	if (name.includes("tvl") || name.includes("volume")) return "25000 ($25k)";
	if (name.includes("price")) return "0.001";
	if (
		name.includes("count") ||
		name.includes("holder") ||
		name.includes("position") ||
		name.includes("trader") ||
		name.includes("swap") ||
		name.includes("limit") ||
		name.includes("size")
	) {
		return "10";
	}
	if (
		name.includes("factor") ||
		name.includes("weight") ||
		name.includes("ratio")
	) {
		return "0.5";
	}
	return "10";
}

type PendingChange = { path: string; label: string; value: string };

// Confirm toasts whose save was submitted but whose result toast has not
// shown yet. Lets the route clear stragglers without touching other rows.
const resolvingConfirms = new Set<string>();

export function dismissResolvedSettingsConfirms() {
	for (const id of resolvingConfirms) toast.dismiss(id);
	resolvingConfirms.clear();
}

export function FieldRow({
	field,
	value,
}: {
	field: EditableField;
	value: unknown;
}) {
	const submit = useSubmit();
	const formRef = useRef<HTMLFormElement>(null);
	const actionData = useActionData<SettingsPayload>();
	const [pending, setPending] = useState<PendingChange | null>(null);
	const [saving, setSaving] = useState(false);
	const pendingRef = useRef<PendingChange | null>(null);
	const savingRef = useRef(false);
	const saveArmedRef = useRef(false);

	const committedInput =
		field.type === "list"
			? Array.isArray(value)
				? (value as unknown[]).join(", ")
				: ""
			: value === null || value === undefined
				? ""
				: String(value);
	const committedRef = useRef(committedInput);
	committedRef.current = committedInput;
	const [draft, setDraft] = useState(committedInput);
	useEffect(() => {
		setDraft(committedInput);
	}, [committedInput]);

	// Toast callbacks outlive renders, so they read refs instead of state.
	const revertDraft = () => {
		if (saveArmedRef.current) return;
		pendingRef.current = null;
		setPending(null);
		setDraft(committedRef.current);
		toast.dismiss(field.path);
	};

	const confirmSave = () => {
		const change = pendingRef.current;
		if (change == null || savingRef.current) return;
		savingRef.current = true;
		saveArmedRef.current = true;
		setSaving(true);
		const fd = new FormData(formRef.current ?? undefined);
		fd.set("op", "setField");
		fd.set("path", change.path);
		fd.set("value", change.value);
		resolvingConfirms.add(change.path);
		toast.dismiss(change.path);
		submit(fd, { method: "post", replace: true });
	};

	const requestConfirm = (next: string) => {
		if (savingRef.current) return;
		const change: PendingChange = {
			path: field.path,
			label: field.label,
			value: next,
		};
		pendingRef.current = change;
		setPending(change);
		const shown = next === "" ? "(empty)" : next;
		// Infinity: the toast must survive the mobile keyboard, it only
		// closes via Save, Dismiss, or swipe.
		toast(`Save ${field.label}?`, {
			id: field.path,
			description:
				shown.length > 80
					? `New value: ${shown.slice(0, 80)}…`
					: `New value: ${shown}`,
			duration: Infinity,
			action: { label: "Save", onClick: () => confirmSave() },
			cancel: { label: "Dismiss", onClick: () => revertDraft() },
			onDismiss: () => revertDraft(),
		});
	};

	// Own save finished: drop the gate. Foreign rows' results are ignored so
	// a concurrent pending on another row keeps its confirm toast.
	useEffect(() => {
		if (!actionData || !saveArmedRef.current) return;
		saveArmedRef.current = false;
		savingRef.current = false;
		setSaving(false);
		pendingRef.current = null;
		setPending(null);
		resolvingConfirms.delete(field.path);
		if (!actionData.ok) setDraft(committedRef.current);
	}, [actionData, field.path]);

	// Navigation away drops the gate without submitting.
	useEffect(
		() => () => {
			toast.dismiss(field.path);
		},
		[field.path],
	);

	const stageTextChange = (next: string) => {
		setDraft(next);
		if (pendingRef.current != null && !savingRef.current) requestConfirm(next);
	};

	const stageTextCommit = () => {
		if (savingRef.current) return;
		if (draft !== committedRef.current) requestConfirm(draft);
	};

	const onTextKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			stageTextCommit();
			e.currentTarget.blur();
		} else if (e.key === "Escape") {
			e.preventDefault();
			revertDraft();
			e.currentTarget.blur();
		}
	};

	// Reset discards any staged draft, then submits resetField directly.
	const resetToDefault = () => {
		if (savingRef.current) return;
		pendingRef.current = null;
		setPending(null);
		setDraft(committedRef.current);
		toast.dismiss(field.path);
		const fd = new FormData(formRef.current ?? undefined);
		fd.set("op", "resetField");
		fd.set("path", field.path);
		submit(fd, { method: "post", replace: true });
	};

	const rowClass =
		"flex min-h-14 items-center gap-4 border-b border-border/60 px-4 last:border-b-0";
	const hint = fieldHint(field);
	const label = (
		<span className="flex min-w-0 flex-1 items-center gap-1.5">
			<span className="truncate">{field.label}</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={`Help for ${field.label}`}
						className="shrink-0 rounded-full text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<InfoIcon className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs flex-col items-start gap-1 space-y-0 text-left">
					<p>{hint.description}</p>
					<p className="text-muted-foreground">Example: {hint.example}</p>
				</TooltipContent>
			</Tooltip>
		</span>
	);

	if (field.type === "boolean") {
		const committed = value === true;
		const checked = pending != null ? pending.value === "true" : committed;
		return (
			<form
				ref={formRef}
				method="post"
				className={rowClass}
				onSubmit={(e) => e.preventDefault()}
			>
				{label}
				<Checkbox
					aria-label={field.label}
					checked={checked}
					disabled={saving}
					className={pending != null ? "ring-2 ring-primary/60" : undefined}
					onCheckedChange={(v) => {
						if (savingRef.current) return;
						const next = v === true ? "true" : "false";
						if (next === String(committed)) {
							if (pendingRef.current != null) revertDraft();
							return;
						}
						requestConfirm(next);
					}}
				/>
			</form>
		);
	}

	if (field.type === "enum") {
		const committed = typeof value === "string" ? value : "";
		return (
			<form
				ref={formRef}
				method="post"
				className={rowClass}
				onSubmit={(e) => e.preventDefault()}
			>
				{label}
				<Select
					aria-label={field.label}
					value={pending?.value ?? committed}
					disabled={saving}
					onValueChange={(v) => {
						if (savingRef.current) return;
						if (v === committed) {
							if (pendingRef.current != null) revertDraft();
							return;
						}
						requestConfirm(v);
					}}
				>
					<SelectTrigger
						aria-label={field.label}
						className={`h-9 w-auto min-w-32 border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0 ${pending != null ? "bg-primary/10" : ""}`}
					>
						<SelectValue placeholder="Select…" />
					</SelectTrigger>
					<SelectContent>
						{(field.values ?? []).map((v) => (
							<SelectItem key={v} value={v}>
								{v}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</form>
		);
	}

	if (field.type === "list") {
		const dirty = draft !== committedInput;
		return (
			<form
				ref={formRef}
				method="post"
				className={rowClass}
				onSubmit={(e) => e.preventDefault()}
			>
				{label}
				<Input
					aria-label={field.label}
					className={`h-9 w-[58%] border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0 ${dirty ? "bg-primary/10" : ""}`}
					value={draft}
					disabled={saving}
					placeholder="Comma-separated values"
					onChange={(e) => stageTextChange(e.target.value)}
					onBlur={stageTextCommit}
					onKeyDown={onTextKeyDown}
				/>
			</form>
		);
	}

	const dirty = draft !== committedInput;
	return (
		<form
			ref={formRef}
			method="post"
			className={rowClass}
			onSubmit={(e) => e.preventDefault()}
		>
			{label}
			<div className="flex w-[58%] items-center gap-1">
				<Input
					aria-label={field.label}
					className={`h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0 ${dirty ? "bg-primary/10" : ""}`}
					type={field.type === "number" ? "number" : "text"}
					value={draft}
					disabled={saving}
					onChange={(e) => stageTextChange(e.target.value)}
					onBlur={stageTextCommit}
					onKeyDown={onTextKeyDown}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 shrink-0 px-1 text-[11px] text-muted-foreground"
					disabled={saving}
					onClick={resetToDefault}
				>
					Reset
				</Button>
			</div>
		</form>
	);
}
