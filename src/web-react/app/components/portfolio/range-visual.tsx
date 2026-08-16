import { formatPrice } from "~/lib/format";

export function RangeVisual({
	ranges,
	current,
	className,
}: {
	ranges: readonly { minPrice: string; maxPrice: string }[];
	current: number | null | undefined;
	className?: string;
}) {
	const prices = ranges.flatMap((r) => [
		Number(r.minPrice),
		Number(r.maxPrice),
	]);
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	if (
		ranges.length === 0 ||
		!Number.isFinite(min) ||
		!Number.isFinite(max) ||
		max <= min
	) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	const pad = (max - min) * 0.04;
	const chartMin = min - pad;
	const chartMax = max + pad;
	const xFor = (price: number) =>
		((price - chartMin) / (chartMax - chartMin)) * 100;
	const currentX =
		current !== null && current !== undefined
			? Math.min(100, Math.max(0, xFor(Number(current))))
			: null;

	const bars: { left: number; width: number }[] = [];
	for (let i = 0; i < 48; i++) {
		const price = chartMin + ((i + 0.5) / 48) * (chartMax - chartMin);
		const inRange = ranges.some(
			(r) => price >= Number(r.minPrice) && price <= Number(r.maxPrice),
		);
		if (inRange) {
			bars.push({ left: (i / 48) * 100, width: 100 / 48 });
		}
	}

	return (
		<div
			className={`relative h-9 w-full min-w-32 overflow-hidden rounded-md border bg-muted/40 ${className ?? ""}`}
			role="img"
			aria-label={`Position range ${formatPrice(min)} to ${formatPrice(max)}`}
		>
			<div className="absolute inset-y-0 flex items-end">
				{bars.map((bar, i) => (
					<div
						key={i}
						className="h-full rounded-[2px] bg-chart-1/60"
						style={{
							position: "absolute",
							left: `${bar.left}%`,
							width: `${bar.width}%`,
						}}
					/>
				))}
			</div>
			<div className="absolute inset-x-0 top-1/2 h-px bg-border" />
			{currentX !== null ? (
				<div
					className="absolute inset-y-0 w-0.5 bg-foreground"
					style={{ left: `${currentX}%` }}
				>
					<span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-sm border bg-background px-1 text-[10px] leading-4 whitespace-nowrap">
						{formatPrice(Number(current))}
					</span>
				</div>
			) : null}
			<span className="absolute bottom-0 left-1 text-[10px] text-muted-foreground">
				{formatPrice(min)}
			</span>
			<span className="absolute right-1 bottom-0 text-[10px] text-muted-foreground">
				{formatPrice(max)}
			</span>
		</div>
	);
}
