"use client";

import type { PositionPnLData } from "@vexis/domain/position.js";
import { useMemo } from "react";
import type { Currency } from "~/lib/currency";
import {
	buildCalendarCells,
	computeWeekBuckets,
	PnlCalendarCard,
} from "./pnl-calendar-card.js";
import { PnlShareShell } from "./pnl-share-shell.js";

export function PnlCalendarShareDialog({
	open,
	onOpenChange,
	month,
	closed,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	month: Date;
	closed: readonly PositionPnLData[];
	currency: Currency;
}) {
	const { cells, monthlyPnl, monthlyDays } = useMemo(
		() => buildCalendarCells(closed, month, "total", currency),
		[closed, month, currency],
	);
	const weekBuckets = useMemo(() => computeWeekBuckets(cells), [cells]);

	const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

	return (
		<PnlShareShell
			open={open}
			onOpenChange={onOpenChange}
			title="Share PnL Calendar"
			description="Preview and export your monthly PnL calendar"
			filename={`pnl-${monthKey}.png`}
		>
			{(cardRef, theme) => (
				<PnlCalendarCard
					ref={cardRef}
					month={month}
					cells={cells}
					monthlyPnl={monthlyPnl}
					monthlyDays={monthlyDays}
					currency={currency}
					weekBuckets={weekBuckets}
					theme={theme}
				/>
			)}
		</PnlShareShell>
	);
}
