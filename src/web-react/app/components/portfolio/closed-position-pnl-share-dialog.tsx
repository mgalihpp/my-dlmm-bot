"use client";

import type { PositionPnLData } from "@vexis/domain/position.js";
import { ClosedPositionPnlCard } from "./closed-position-pnl-card.js";
import { PnlShareShell } from "./pnl-share-shell.js";

export function ClosedPositionPnlShareDialog({
	open,
	onOpenChange,
	position,
	pairLabel,
	poolAddress,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	position: PositionPnLData;
	pairLabel: string;
	poolAddress: string;
	currency: "usd" | "sol";
}) {
	return (
		<PnlShareShell
			open={open}
			onOpenChange={onOpenChange}
			title="Share Closed Position PnL"
			description="Preview and export your closed position PnL card"
			filename={`pnl-closed-pos-${position.positionAddress.slice(0, 6)}.png`}
		>
			{(cardRef, theme) => (
				<ClosedPositionPnlCard
					ref={cardRef}
					position={position}
					pairLabel={pairLabel}
					poolAddress={poolAddress}
					currency={currency}
					theme={theme}
				/>
			)}
		</PnlShareShell>
	);
}
