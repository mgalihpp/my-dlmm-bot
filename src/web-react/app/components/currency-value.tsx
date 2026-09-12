import { CurrencyIcon } from "~/components/currency-icon";
import type { Currency } from "~/lib/currency";
import { fmtIdr, fmtSol, fmtUsd } from "~/lib/format";
import { cn } from "~/lib/utils";

export function CurrencyValue({
	currency,
	value,
	usdToIdr,
	className,
}: {
	currency: Currency;
	value: string | number | null | undefined;
	usdToIdr?: number | null;
	className?: string;
}): React.JSX.Element {
	const formatted =
		currency === "idr"
			? fmtIdr(value, usdToIdr)
			: currency === "usd"
				? fmtUsd(value)
				: fmtSol(value);
	if (formatted === "-") return <>{formatted}</>;
	const amount =
		currency === "sol" ? formatted.replace(/ SOL$/, "") : formatted;
	return (
		<span className={cn("inline-flex items-center gap-1", className)}>
			<span>{amount}</span>
			<CurrencyIcon currency={currency} decorative />
			<span className="sr-only">
				{currency === "usd"
					? "USD / USDC"
					: currency === "idr"
						? "IDR / Rupiah"
						: "SOL / Solana"}
			</span>
		</span>
	);
}
