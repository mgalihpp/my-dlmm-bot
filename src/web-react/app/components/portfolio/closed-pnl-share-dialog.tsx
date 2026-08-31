"use client";

import type { ClosedPoolWithIcons } from "~/lib/server/portfolio.server";
import { ClosedPnlCard } from "./closed-pnl-card.js";
import { PnlShareShell } from "./pnl-share-shell.js";

export function ClosedPnlShareDialog({
	open,
	onOpenChange,
	pool,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	pool: ClosedPoolWithIcons;
	currency: "usd" | "sol";
}) {
	return (
		<PnlShareShell
			open={open}
			onOpenChange={onOpenChange}
			title="Share Closed PnL"
			description="Preview and export your closed position PnL card"
			filename={`pnl-closed-${pool.poolAddress.slice(0, 6)}.png`}
		>
			{(cardRef, theme) => (
				<ClosedPnlCard
					ref={cardRef}
					pool={pool}
					currency={currency}
					theme={theme}
				/>
			)}
		</PnlShareShell>
	);
}
