import { ChevronRightIcon, ShareIcon } from "lucide-react";
import { memo, useRef, useState } from "react";
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
import { PortfolioAmount } from "./closed-detail";
import { ClosedPnlShareDialog } from "./closed-pnl-share-dialog.js";
import type { Currency } from "./portfolio-page";

type ClosedPool = ClosedPoolWithIcons;

function TokenIcon({ icon, symbol }: { icon?: string | null; symbol: string }) {
	const src = proxiedIconUrl(icon);
	if (src)
		return (
			<img
				src={src}
				alt={symbol}
				crossOrigin="anonymous"
				referrerPolicy="no-referrer"
				loading="lazy"
				className="size-5 rounded-full object-cover"
				onError={(event) => {
					event.currentTarget.style.display = "none";
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
			<span className="flex -space-x-1">
				<TokenIcon icon={pool.tokenXIcon} symbol={pool.tokenX} />
				<TokenIcon icon={pool.tokenYIcon} symbol={pool.tokenY} />
			</span>
			{pair(pool.tokenX, pool.tokenY)}
		</span>
	);
}

export const ClosedPoolCard = memo(function ClosedPoolCard({
	pool,
	onDetails,
	currency,
}: {
	pool: ClosedPool;
	onDetails: (pool: ClosedPool) => void;
	currency: Currency;
}) {
	const pnlUsd = parseFloat(pool.pnlUsd);
	const pnlSol = parseFloat(pool.pnlSol);
	const [shareOpen, setShareOpen] = useState(false);
	const lastShareCloseRef = useRef(0);

	const handleShareOpenChange = (open: boolean) => {
		if (!open) lastShareCloseRef.current = Date.now();
		setShareOpen(open);
	};

	const handleCardClick = () => {
		if (Date.now() - lastShareCloseRef.current < 400) return;
		onDetails(pool);
	};

	const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleCardClick();
		}
	};

	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: card contains links and cannot be a button */}
			<div
				className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
				role="button"
				tabIndex={0}
				onClick={handleCardClick}
				onKeyDown={handleCardKeyDown}
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
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Share"
						onClick={(e) => {
							e.stopPropagation();
							setShareOpen(true);
						}}
					>
						<ShareIcon className="size-3" />
					</Button>
					<ChevronRightIcon
						className="size-5 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
			</div>
			{shareOpen ? (
				<ClosedPnlShareDialog
					open={shareOpen}
					onOpenChange={handleShareOpenChange}
					pool={pool}
					currency={currency}
				/>
			) : null}
		</>
	);
});

export { ClosedPair };
