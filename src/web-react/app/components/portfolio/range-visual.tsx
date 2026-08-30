import { fmtMc, formatPrice } from "~/lib/format";

export function resolveRangeAnchor(
	ranges: readonly {
		minPrice: string;
		maxPrice: string;
		poolActivePrice?: string | number | null;
	}[],
	current: number | null | undefined,
	mcap?: number | null,
): { effectiveCurrent: number | null; effectiveMcap: number | null } {
	let effectiveCurrent: number | null = null;
	for (const r of ranges) {
		const v = (r as { poolActivePrice?: string | number | null })
			.poolActivePrice;
		if (v != null) {
			const n = Number(v);
			if (Number.isFinite(n) && n > 0) {
				effectiveCurrent = n;
				break;
			}
		}
	}
	if (effectiveCurrent == null) {
		const c = current != null ? Number(current) : NaN;
		if (Number.isFinite(c) && c > 0) effectiveCurrent = c;
	}
	let effectiveMcap: number | null = mcap ?? null;
	if (
		effectiveMcap != null &&
		Number.isFinite(effectiveMcap) &&
		effectiveMcap > 0 &&
		current != null &&
		Number.isFinite(Number(current)) &&
		Number(current) > 0 &&
		effectiveCurrent != null &&
		Number.isFinite(effectiveCurrent) &&
		effectiveCurrent > 0 &&
		effectiveCurrent !== Number(current)
	) {
		effectiveMcap = effectiveMcap * (effectiveCurrent / Number(current));
	}
	if (
		effectiveMcap != null &&
		(!Number.isFinite(effectiveMcap) || effectiveMcap <= 0)
	) {
		effectiveMcap = null;
	}
	return { effectiveCurrent, effectiveMcap };
}

export function RangeVisual({
	ranges,
	current,
	mcap,
	className,
	loading = false,
}: {
	ranges: readonly {
		minPrice: string;
		maxPrice: string;
		poolActivePrice?: string | number | null;
	}[];
	current: number | null | undefined;
	mcap?: number | null;
	className?: string;
	loading?: boolean;
}) {
	const prices = ranges.flatMap((r) => [
		Number(r.minPrice),
		Number(r.maxPrice),
	]);
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	if (ranges.length === 0) {
		if (loading) {
			return (
				<span className="inline-block h-4 w-24 animate-pulse rounded bg-muted" />
			);
		}
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}
	const pad = (max - min) * 0.04;
	const chartMin = min - pad;
	const chartMax = max + pad;
	const xFor = (price: number) =>
		((price - chartMin) / (chartMax - chartMin)) * 100;
	const { effectiveCurrent, effectiveMcap } = resolveRangeAnchor(
		ranges,
		current,
		mcap,
	);
	const currentX =
		effectiveCurrent !== null
			? Math.min(100, Math.max(0, xFor(Number(effectiveCurrent))))
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
				leftSide:
					currentX === null || price < Number(effectiveCurrent as number),
			});
		}
	}

	const labelX =
		currentX !== null ? Math.min(90, Math.max(10, currentX)) : null;

	const hasMc =
		effectiveMcap != null &&
		Number.isFinite(effectiveMcap) &&
		effectiveMcap > 0 &&
		effectiveCurrent != null &&
		Number.isFinite(Number(effectiveCurrent)) &&
		Number(effectiveCurrent) > 0;
	const mcFor = (price: number) =>
		hasMc
			? (effectiveMcap as number) * (price / Number(effectiveCurrent))
			: null;
	const fmtLabel = (price: number) => {
		const mc = mcFor(price);
		return mc != null ? fmtMc(mc) : formatPrice(price);
	};
	const ariaLabel = hasMc
		? `Position range ${fmtMc(mcFor(min))} to ${fmtMc(mcFor(max))}`
		: `Position range ${formatPrice(min)} to ${formatPrice(max)}`;

	return (
		<div className={`w-full min-w-32 ${className ?? ""}`}>
			<div
				className="relative h-16 w-full overflow-hidden rounded-md bg-muted/40"
				role="img"
				aria-label={ariaLabel}
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
							<span className="block text-muted-foreground">
								{hasMc ? "MC" : "Pool Price"}
							</span>
							<span className="block font-semibold tabular-nums">
								{hasMc
									? fmtMc(effectiveMcap)
									: formatPrice(Number(effectiveCurrent as number))}
							</span>
						</span>
					</>
				) : null}
			</div>
			<div className="mt-1.5 flex justify-between px-1 text-[11px] font-medium tabular-nums text-muted-foreground">
				<span>{fmtLabel(min)}</span>
				<span>{fmtLabel((min + max) / 2)}</span>
				<span>{fmtLabel(max)}</span>
			</div>
		</div>
	);
}
