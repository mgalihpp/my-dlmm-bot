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

	const baselinePct = 12.8;
	const bars: {
		left: number;
		width: number;
		height: number;
		leftSide: boolean;
	}[] = [];
	for (let i = 0; i < 48; i++) {
		const price = chartMin + ((i + 0.5) / 48) * (chartMax - chartMin);
		const inRange = ranges.some(
			(r) => price >= Number(r.minPrice) && price <= Number(r.maxPrice),
		);
		if (inRange) {
			const progress = i / 47;
			const height = ((11 + (1 - progress) * 28) / 86) * 100;
			bars.push({
				left: (i / 48) * 100,
				width: 100 / 48,
				height,
				leftSide: currentX === null || price < Number(current),
			});
		}
	}

	const labelX =
		currentX !== null ? Math.min(90, Math.max(10, currentX)) : null;

	return (
		<div
			className={`relative h-16 w-full min-w-32 overflow-hidden rounded-md bg-muted/40 ${className ?? ""}`}
			role="img"
			aria-label={`Position range ${formatPrice(min)} to ${formatPrice(max)}`}
		>
			{bars.map((bar) => (
				<div
					key={bar.left}
					className={`absolute ${bar.leftSide ? "bg-chart-1" : "bg-chart-2"}`}
					style={{
						left: `${bar.left}%`,
						width: `calc(${bar.width}% + 1px)`,
						bottom: `${baselinePct}%`,
						height: `${bar.height}%`,
					}}
				/>
			))}
			<div
				className="absolute inset-x-0"
				style={{ bottom: `${baselinePct}%` }}
			/>
			{currentX !== null ? (
				<>
					<div
						className="absolute inset-y-0 w-0.5 bg-foreground/70"
						style={{ left: `${currentX}%` }}
					/>
					<span
						className="absolute top-0.5 -translate-x-1/2 rounded-sm bg-background px-1 text-center text-[9px] leading-3 whitespace-nowrap"
						style={{ left: `${labelX}%` }}
					>
						<span className="block text-muted-foreground">Pool Price</span>
						<span className="block font-semibold tabular-nums">
							{formatPrice(Number(current))}
						</span>
					</span>
				</>
			) : null}
			<span className="absolute bottom-0 left-1 text-[10px] text-muted-foreground">
				{formatPrice(min)}
			</span>
			<span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
				{formatPrice((min + max) / 2)}
			</span>
			<span className="absolute right-1 bottom-0 text-[10px] text-muted-foreground">
				{formatPrice(max)}
			</span>
		</div>
	);
}
