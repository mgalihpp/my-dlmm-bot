export type PnlTimeRange =
	| "daily"
	| "weekly"
	| "monthly"
	| "yearly"
	| "allTime";

export interface CardStyle {
	readonly background?: string;
	readonly texture?: "off" | "dots" | "grid" | "lines" | "noise";
	readonly textureOpacity?: number;
	readonly textureZoom?: number;
	readonly showDetails?: boolean;
}

export interface PnlCardStats {
	readonly winRate: number | null;
	readonly totalClosed: number;
	readonly avgPnlUsd: string | null;
	readonly bestUsd: string | null;
	readonly worstUsd: string | null;
}

export interface PnlSummaryCardData {
	readonly wallet: string;
	readonly walletShort: string;
	readonly mode: "total";
	readonly title: string;
	readonly pnlUsd: string;
	readonly pnlSol: string;
	readonly pnlPct: string | null;
	readonly stats: PnlCardStats;
	readonly date: string;
	readonly timestampUtc: string;
	readonly positionCount: number;
	readonly feesSol: string;
	readonly depositsSol: string;
	readonly withdrawalsSol: string;
	readonly timeRange: PnlTimeRange;
	readonly timeRangeLabel: string;
}

export interface PnlPositionCardData {
	readonly wallet: string;
	readonly walletShort: string;
	readonly mode: "position";
	readonly title: string;
	readonly pnlUsd: string;
	readonly pnlSol: string;
	readonly pnlPct: string | null;
	readonly stats: PnlCardStats;
	readonly date: string;
	readonly pairName: string;
	readonly poolAddress: string;
	readonly sent: string;
	readonly received: string;
	readonly closedAgo: string | null;
	readonly traderLabel: string;
}

export type PnlCardData = PnlSummaryCardData | PnlPositionCardData;

export interface PnlCardRenderOpts {
	readonly width?: number;
	readonly height?: number;
	readonly style?: CardStyle;
}
