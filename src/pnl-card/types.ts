export interface PnlCardStats {
	readonly winRate: number | null;
	readonly totalClosed: number;
	readonly avgPnlUsd: string | null;
	readonly bestUsd: string | null;
	readonly worstUsd: string | null;
}

export interface PnlCardData {
	readonly wallet: string;
	readonly walletShort: string;
	readonly mode: "total" | "position";
	readonly title: string;
	readonly pnlUsd: string;
	readonly pnlSol: string;
	readonly pnlPct: string | null;
	readonly stats: PnlCardStats;
	readonly date: string;
	readonly pairName?: string;
	readonly poolAddress?: string;
}

export interface PnlCardRenderOpts {
	readonly width?: number;
	readonly height?: number;
}
