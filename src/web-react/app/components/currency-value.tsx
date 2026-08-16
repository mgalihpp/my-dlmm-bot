import { CurrencyIcon } from "~/components/currency-icon";
import { fmtSol, fmtUsd } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { Currency } from "./portfolio/portfolio-page";

export function CurrencyValue({
	currency,
	value,
	className,
}: {
	currency: Currency;
	value: string | number | null | undefined;
	className?: string;
}) {
	const formatted = currency === "usd" ? fmtUsd(value) : fmtSol(value);
	if (formatted === "-") return <>{formatted}</>;
	const amount =
		currency === "sol" ? formatted.replace(/ SOL$/, "") : formatted;
	return (
		<span className={cn("inline-flex items-center gap-1", className)}>
			<span>{amount}</span>
			<CurrencyIcon currency={currency} decorative />
			<span className="sr-only">
				{currency === "usd" ? "USD / USDC" : "SOL / Solana"}
			</span>
		</span>
	);
}
