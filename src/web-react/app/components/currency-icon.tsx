import { cn } from "~/lib/utils";

export type Currency = "usd" | "sol";

const currencyIcons = {
	usd: { src: "/usd-coin-usdc-logo.png", alt: "USD / USDC" },
	sol: { src: "/Solana_logo.png", alt: "SOL / Solana" },
} satisfies Record<Currency, { src: string; alt: string }>;

export function CurrencyIcon({
	currency,
	className,
	decorative = false,
}: {
	currency: Currency;
	className?: string;
	decorative?: boolean;
}) {
	const icon = currencyIcons[currency];
	return (
		<img
			src={icon.src}
			alt={decorative ? "" : icon.alt}
			aria-hidden={decorative}
			className={cn("size-4 object-contain", className)}
		/>
	);
}
