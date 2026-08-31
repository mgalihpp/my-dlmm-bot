import { InfoIcon } from "lucide-react";
import { useRef } from "react";
import { useSubmit } from "react-router";
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
import type { EditableField } from "~/lib/settings";

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

export function FieldRow({
	field,
	value,
}: {
	field: EditableField;
	value: unknown;
}) {
	const submit = useSubmit();
	const formRef = useRef<HTMLFormElement>(null);

	const send = (formData: FormData) => {
		formData.set("op", "setField");
		formData.set("path", field.path);
		submit(formData, { method: "post", replace: true });
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
		const checked = value === true;
		return (
			<form ref={formRef} method="post" className={rowClass}>
				{label}
				<Checkbox
					aria-label={field.label}
					checked={checked}
					onCheckedChange={(v) => {
						const fd = new FormData(formRef.current ?? undefined);
						fd.set("value", v === true ? "true" : "false");
						send(fd);
					}}
				/>
			</form>
		);
	}

	if (field.type === "enum") {
		return (
			<form ref={formRef} method="post" className={rowClass}>
				{label}
				<Select
					aria-label={field.label}
					value={typeof value === "string" ? value : ""}
					onValueChange={(v) => {
						const fd = new FormData(formRef.current ?? undefined);
						fd.set("value", v);
						send(fd);
					}}
				>
					<SelectTrigger
						aria-label={field.label}
						className="h-9 w-auto min-w-32 border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0"
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
		const text = Array.isArray(value) ? (value as unknown[]).join(", ") : "";
		return (
			<form ref={formRef} method="post" className={rowClass}>
				{label}
				<Input
					aria-label={field.label}
					key={text}
					className="h-9 w-[58%] border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0"
					defaultValue={text}
					placeholder="Comma-separated values"
					onBlur={(e) => {
						const fd = new FormData(formRef.current ?? undefined);
						fd.set("value", e.target.value);
						send(fd);
					}}
				/>
			</form>
		);
	}

	const inputValue = value === null || value === undefined ? "" : String(value);
	return (
		<form ref={formRef} method="post" className={rowClass}>
			{label}
			<div className="flex w-[58%] items-center gap-1">
				<Input
					aria-label={field.label}
					key={inputValue}
					className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0"
					type={field.type === "number" ? "number" : "text"}
					defaultValue={inputValue}
					onBlur={(e) => {
						const fd = new FormData(formRef.current ?? undefined);
						fd.set("value", e.target.value);
						send(fd);
					}}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 shrink-0 px-1 text-[11px] text-muted-foreground"
					onClick={() => {
						const fd = new FormData(formRef.current ?? undefined);
						fd.set("op", "resetField");
						fd.set("path", field.path);
						submit(fd, { method: "post", replace: true });
					}}
				>
					Reset
				</Button>
			</div>
		</form>
	);
}
