import type { OrganicBucket } from "~/lib/pools";

export function Sparkline({ values }: { values: readonly number[] }) {
	const points = values.filter((v) => Number.isFinite(v));
	if (points.length < 2) return <span className="text-xs">—</span>;
	const min = Math.min(...points);
	const max = Math.max(...points);
	const range = max - min || 1;
	const coords = points
		.map(
			(v, i) =>
				`${(i / (points.length - 1)) * 100},${20 - ((v - min) / range) * 16}`,
		)
		.join(" ");
	const positive = points.at(-1)! >= points[0];
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			className="h-5 w-16"
			aria-hidden="true"
		>
			<polyline
				points={coords}
				fill="none"
				stroke={positive ? "var(--chart-2)" : "var(--chart-1)"}
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export function badgeVariant(kind: OrganicBucket | "na") {
	switch (kind) {
		case "pass":
			return "default" as const;
		case "review":
			return "secondary" as const;
		case "blocked":
			return "destructive" as const;
		default:
			return "outline" as const;
	}
}
