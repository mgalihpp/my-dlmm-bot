"use client";

import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import { PnlShareShell } from "./pnl-share-shell.js";
import { PositionPnlCard } from "./position-pnl-card.js";

export function PositionPnlShareDialog({
	open,
	onOpenChange,
	pool,
	currency,
	solPrice,
	usdToIdr,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	pool: OpenPoolWithIcons;
	currency: "usd" | "sol" | "idr";
	solPrice: number | null;
	usdToIdr: number | null;
}) {
	const poolKey = `${pool.tokenX}-${pool.tokenY}-${pool.poolAddress.slice(0, 4)}`;
	return (
		<PnlShareShell
			open={open}
			onOpenChange={onOpenChange}
			title="Share Position PnL"
			description="Preview and export your position PnL card"
			filename={`pnl-position-${poolKey}.png`}
		>
			{(cardRef, theme, showDetails) => (
				<PositionPnlCard
					ref={cardRef}
					pool={pool}
					currency={currency}
					solPrice={solPrice}
					usdToIdr={usdToIdr}
					theme={theme}
					showDetails={showDetails}
				/>
			)}
		</PnlShareShell>
	);
}
