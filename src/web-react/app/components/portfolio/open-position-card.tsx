import { ChevronRightIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
	fmtPnlPct,
	meteoraUrl,
	pair,
	pnlClass,
	pnlSignForCurrency,
	shortAddr,
} from "~/lib/format";
import { proxiedIconUrl } from "~/lib/icon";
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import type { Currency } from "./portfolio-page";
import { PortfolioAmount } from "./positions-detail";
import { RangeVisual } from "./range-visual";

export function OpenPositionCard({
	pool,
	onDetails,
	currency,
	solPrice,
	rangesLoading = false,
}: {
	pool: OpenPoolWithIcons;
	onDetails: () => void;
	currency: Currency;
	solPrice: number | null;
	rangesLoading?: boolean;
}) {
	const oor = pool.outOfRange === true || pool.positionsOutOfRange.length > 0;
	return (
		// biome-ignore lint/a11y/useSemanticElements: card contains links and cannot be a button
		<div
			className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
			role="button"
			tabIndex={0}
			onClick={onDetails}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onDetails();
				}
			}}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-bold">
						{proxiedIconUrl(pool.tokenXIcon) ? (
							<img
								src={proxiedIconUrl(pool.tokenXIcon) as string}
								alt={pool.tokenX}
								crossOrigin="anonymous"
								referrerPolicy="no-referrer"
								loading="lazy"
								className="size-full object-cover"
								onError={(e) => {
									(e.currentTarget as HTMLImageElement).style.display = "none";
								}}
							/>
						) : (
							pool.tokenX.slice(0, 2).toUpperCase()
						)}
					</div>
					<div className="min-w-0">
						<a
							href={meteoraUrl(pool.poolAddress)}
							target="_blank"
							rel="noopener noreferrer"
							className="block truncate font-semibold hover:underline"
							onClick={(event) => event.stopPropagation()}
						>
							{pair(pool.tokenX, pool.tokenY)}
						</a>
						<span className="font-mono text-xs text-muted-foreground">
							{shortAddr(pool.poolAddress, 5)}
						</span>
					</div>
				</div>
				<Badge variant={oor ? "destructive" : "outline"}>
					{oor ? "OOR" : "In range"}
				</Badge>
			</div>
			<div className="mt-5 grid grid-cols-3 gap-3">
				<div>
					<p className="text-xs text-muted-foreground">Balance</p>
					<PortfolioAmount
						usd={pool.balances}
						currency={currency}
						solPrice={solPrice}
					/>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Fees</p>
					<PortfolioAmount
						usd={pool.unclaimedFees}
						currency={currency}
						solPrice={solPrice}
					/>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						PnL {currency.toUpperCase()}
					</p>
					<span
						className={cn(
							"tabular-nums",
							pnlClass(pnlSignForCurrency(pool.pnl, pool.pnlSol, currency)),
						)}
					>
						<PortfolioAmount
							usd={pool.pnl}
							sol={pool.pnlSol}
							currency={currency}
							solPrice={solPrice}
						/>
						<p className="text-xs text-muted-foreground">
							{fmtPnlPct(pool.pnlPctChange, pool.pnlSolPctChange, currency)}
						</p>
					</span>
				</div>
			</div>
			<div className="mt-4">
				<RangeVisual
					ranges={pool.positionsRange ?? []}
					current={pool.poolPrice}
					mcap={pool.mcap ?? null}
					loading={rangesLoading}
				/>
			</div>
			<div className="mt-3 flex items-center justify-between">
				<span className="text-xs text-muted-foreground">
					{pool.openPositionCount} position
					{pool.openPositionCount === 1 ? "" : "s"}
				</span>
				<ChevronRightIcon
					className="size-5 text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
