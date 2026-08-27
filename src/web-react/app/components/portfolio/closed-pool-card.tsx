import { ChevronRightIcon, Share2Icon } from "lucide-react";
import { memo } from "react";
import { Button } from "~/components/ui/button";
import {
	fmtPct,
	meteoraUrl,
	pair,
	pnlClass,
	pnlSign,
	timeAgo,
} from "~/lib/format";
import { proxiedIconUrl } from "~/lib/icon";
import type { ClosedPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import { createPnlCardDataFromPosition } from "../../../../pnl-card/render.js";
import type { PnlCardData } from "../../../../pnl-card/types.js";
import { PortfolioAmount } from "./closed-detail";
import type { Currency } from "./portfolio-page";

type ClosedPool = ClosedPoolWithIcons;

function TokenIcon({ icon, symbol }: { icon?: string | null; symbol: string }) {
	const src = proxiedIconUrl(icon);
	if (src)
		return (
			<img
				src={src}
				alt={symbol}
				loading="lazy"
				className="size-5 rounded-full object-cover"
				crossOrigin="anonymous"
				referrerPolicy="no-referrer"
				onError={(e) => {
					(e.currentTarget as HTMLImageElement).style.display = "none";
				}}
			/>
		);
	return (
		<span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
			{symbol.slice(0, 2).toUpperCase()}
		</span>
	);
}

function ClosedPair({ pool }: { pool: ClosedPool }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<TokenIcon icon={pool.tokenXIcon} symbol={pool.tokenX} />
			{pair(pool.tokenX, pool.tokenY)}
			<TokenIcon icon={pool.tokenYIcon} symbol={pool.tokenY} />
		</span>
	);
}

export const ClosedPoolCard = memo(function ClosedPoolCard({
	pool,
	onDetails,
	currency,
	onPnlCard,
	wallet,
}: {
	pool: ClosedPool;
	onDetails: (pool: ClosedPool) => void;
	currency: Currency;
	onPnlCard?: (data: PnlCardData) => void;
	wallet?: string;
}) {
	const pnlUsd = parseFloat(pool.pnlUsd);
	const pnlSol = parseFloat(pool.pnlSol);
	const handleCard = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!onPnlCard) return;
		const data = createPnlCardDataFromPosition({
			wallet: wallet ?? "",
			pnlUsd: pool.pnlUsd,
			pnlSol: pool.pnlSol,
			pnlPct: pool.pnlPctChange,
			pairName: pair(pool.tokenX, pool.tokenY),
			poolAddress: pool.poolAddress,
		});
		onPnlCard(data);
	};

	return (
		<button
			className="rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50"
			type="button"
			tabIndex={0}
			onClick={() => onDetails(pool)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onDetails(pool);
				}
			}}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<a
						href={meteoraUrl(pool.poolAddress)}
						target="_blank"
						rel="noopener noreferrer"
						className="block truncate font-semibold hover:underline"
						onClick={(event) => event.stopPropagation()}
					>
						<ClosedPair pool={pool} />
					</a>
					<p className="text-xs text-muted-foreground">
						Closed {timeAgo(pool.lastClosedAt)}
					</p>
				</div>
				<span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
					Closed
				</span>
			</div>
			<div className="mt-5 grid grid-cols-3 gap-3">
				<div>
					<p className="text-xs text-muted-foreground">Deposit</p>
					<PortfolioAmount
						usd={pool.totalDeposit}
						sol={pool.totalDepositSol}
						currency={currency}
					/>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Withdraw</p>
					<PortfolioAmount
						usd={pool.totalWithdrawal}
						sol={pool.totalWithdrawalSol}
						currency={currency}
					/>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Fees</p>
					<PortfolioAmount
						usd={pool.totalFee}
						sol={pool.totalFeeSol}
						currency={currency}
					/>
				</div>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
				<div>
					<p className="text-xs text-muted-foreground">PnL USD</p>
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
						<PortfolioAmount
							usd={pool.pnlUsd}
							sol={pool.pnlSol}
							currency="usd"
						/>
					</span>
					<p className="text-xs text-muted-foreground">
						{fmtPct(pool.pnlPctChange)}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">PnL SOL</p>
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
						<PortfolioAmount
							usd={pool.pnlUsd}
							sol={pool.pnlSol}
							currency="sol"
						/>
					</span>
					<p className="text-xs text-muted-foreground">
						{fmtPct(pool.pnlSolPctChange)}
					</p>
				</div>
			</div>
			<div className="mt-3 flex items-center justify-end gap-1">
				{onPnlCard ? (
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={handleCard}
						aria-label="Generate PnL card"
					>
						<Share2Icon className="size-4" />
					</Button>
				) : null}
				<ChevronRightIcon
					className="size-5 text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		</button>
	);
});

export { ClosedPair };
