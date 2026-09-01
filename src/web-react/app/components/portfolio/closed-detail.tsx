import type { PositionPnLData } from "@vexis/domain/position.js";
import { ShareIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { CurrencyIcon } from "~/components/currency-icon";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	fmtPct,
	fmtPnl,
	fmtUsd,
	pnlClass,
	pnlSign,
	type SolDecimals,
	shortAddr,
	solscanAccountUrl,
	tsLocal,
} from "~/lib/format";
import { cn } from "~/lib/utils";
import { ClosedPositionPnlShareDialog } from "./closed-position-pnl-share-dialog.js";
import type { Currency } from "./portfolio-page";

interface DetailPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly positions?: readonly PositionPnLData[];
}

export function PortfolioAmount({
	usd,
	sol,
	currency,
	solDecimals = 3,
}: {
	usd: string | number | null | undefined;
	sol?: string | number | null;
	currency: Currency;
	solDecimals?: SolDecimals;
}) {
	const formatted =
		sol != null
			? fmtPnl(usd, sol, currency, solDecimals)
			: currency === "usd"
				? fmtUsd(usd)
				: "-";
	const value = currency === "sol" ? formatted.replace(/ SOL$/, "") : formatted;
	return (
		<span className="inline-flex items-center gap-1 tabular-nums">
			<span>{value}</span>
			{value !== "-" ? <CurrencyIcon currency={currency} decorative /> : null}
		</span>
	);
}

const DETAIL_COLUMNS = [
	"Position",
	"Deposit",
	"Withdraw",
	"Fees",
	"PnL USD",
	"PnL SOL",
	"Closed",
];

function ClosedDetailSkeleton() {
	return (
		<div className="space-y-3 px-4 py-4">
			<Skeleton className="mb-2 h-3 w-48" />
			{[0, 1, 2].map((n) => (
				<div key={n} className="space-y-3 rounded-lg border p-3">
					<Skeleton className="h-4 w-24" />
					<div className="grid grid-cols-2 gap-3">
						{DETAIL_COLUMNS.slice(1).map((col) => (
							<div key={col} className="space-y-1">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-4 w-24" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

export function ClosedDetail({
	pool,
	pairLabel,
	currency,
	layout = "card",
}: {
	pool: string;
	pairLabel: string;
	currency: Currency;
	layout?: "card" | "table";
}) {
	const fetcher = useFetcher<DetailPayload>();
	const [sharePos, setSharePos] = useState<PositionPnLData | null>(null);
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data === undefined)
			fetcher.load(`/api/closed-detail/${encodeURIComponent(pool)}`);
	}, [pool, fetcher.state, fetcher.data, fetcher.load]);
	const data = fetcher.data;
	if (data === undefined) return <ClosedDetailSkeleton />;
	if (!data.ok)
		return (
			<div className="py-6 text-center text-sm text-destructive">
				{data.error ?? "Failed to load closed positions"}
			</div>
		);
	const closed = (data.positions ?? []).filter((p) => p.isClosed);
	if (closed.length === 0)
		return (
			<div className="py-6 text-center text-sm text-muted-foreground">
				No closed positions for {pairLabel}.
			</div>
		);
	if (layout === "table")
		return (
			<>
				<div className="overflow-x-auto px-4 py-4">
					<Table className="min-w-[840px] rounded-md border">
						<TableHeader className="bg-muted/50">
							<TableRow>
								{DETAIL_COLUMNS.map((column) => (
									<TableHead key={column}>{column}</TableHead>
								))}
								<TableHead>Action</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{closed.map((pos) => {
								const pnlUsd = parseFloat(pos.pnlUsd);
								const pnlSol =
									pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : null;
								return (
									<TableRow key={pos.positionAddress}>
										<TableCell>
											<a
												href={solscanAccountUrl(pos.positionAddress)}
												target="_blank"
												rel="noopener noreferrer"
												className="font-mono text-xs text-muted-foreground hover:underline"
											>
												{shortAddr(pos.positionAddress, 6)}
											</a>
										</TableCell>
										<TableCell className="tabular-nums">
											<PortfolioAmount
												usd={pos.allTimeDeposits.total.usd}
												sol={pos.allTimeDeposits.total.sol}
												currency={currency}
												solDecimals={4}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											<PortfolioAmount
												usd={pos.allTimeWithdrawals.total.usd}
												sol={pos.allTimeWithdrawals.total.sol}
												currency={currency}
												solDecimals={4}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											<PortfolioAmount
												usd={pos.allTimeFees.total.usd}
												sol={pos.allTimeFees.total.sol}
												currency={currency}
												solDecimals={4}
											/>
										</TableCell>
										<TableCell
											className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}
										>
											<PortfolioAmount usd={pos.pnlUsd} currency="usd" />
											<div className="text-xs text-muted-foreground">
												{fmtPct(pos.pnlPctChange)}
											</div>
										</TableCell>
										<TableCell
											className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}
										>
											<PortfolioAmount
												usd={pos.pnlSol}
												sol={pnlSol}
												currency="sol"
												solDecimals={4}
											/>
											<div className="text-xs text-muted-foreground">
												{fmtPct(pos.pnlSolPctChange ?? null)}
											</div>
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{tsLocal(pos.closedAt)}
										</TableCell>
										<TableCell onClick={(e) => e.stopPropagation()}>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs"
												onClick={(e) => {
													e.stopPropagation();
													setSharePos(pos);
												}}
											>
												<ShareIcon className="size-3" />
												Share
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
				{sharePos ? (
					<ClosedPositionPnlShareDialog
						open={!!sharePos}
						onOpenChange={(o) => !o && setSharePos(null)}
						position={sharePos}
						pairLabel={pairLabel}
						poolAddress={pool}
						currency={currency}
					/>
				) : null}
			</>
		);
	return (
		<>
			<div className="space-y-3 px-4 py-4">
				<p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
					CLOSED POSITIONS · {pairLabel.toUpperCase()}
				</p>
				{closed.map((pos) => {
					const pnlUsd = parseFloat(pos.pnlUsd);
					const pnlSol =
						pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : null;
					const pnlPct = parseFloat(pos.pnlPctChange);
					return (
						<div
							key={pos.positionAddress}
							className="space-y-3 rounded-lg border p-3"
						>
							<div className="flex items-center justify-between gap-3">
								<a
									href={solscanAccountUrl(pos.positionAddress)}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-xs text-muted-foreground hover:underline"
								>
									{shortAddr(pos.positionAddress, 6)}
								</a>
								<span className="text-xs text-muted-foreground">
									{tsLocal(pos.closedAt)}
								</span>
							</div>
							<div className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<p className="text-xs text-muted-foreground">Deposit</p>
									<PortfolioAmount
										usd={pos.allTimeDeposits.total.usd}
										sol={pos.allTimeDeposits.total.sol}
										currency={currency}
										solDecimals={4}
									/>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Withdraw</p>
									<PortfolioAmount
										usd={pos.allTimeWithdrawals.total.usd}
										sol={pos.allTimeWithdrawals.total.sol}
										currency={currency}
										solDecimals={4}
									/>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Fees</p>
									<PortfolioAmount
										usd={pos.allTimeFees.total.usd}
										sol={pos.allTimeFees.total.sol}
										currency={currency}
										solDecimals={4}
									/>
								</div>
								<div className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
									<p className="text-xs text-muted-foreground">PnL USD</p>
									<PortfolioAmount usd={pos.pnlUsd} currency="usd" />
									<p className="text-xs text-muted-foreground">
										{fmtPct(pnlPct)}
									</p>
								</div>
								<div className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
									<p className="text-xs text-muted-foreground">PnL SOL</p>
									<PortfolioAmount
										usd={pos.pnlSol}
										sol={pnlSol}
										currency="sol"
										solDecimals={4}
									/>
									<p className="text-xs text-muted-foreground">
										{fmtPct(pos.pnlSolPctChange ?? null)}
									</p>
								</div>
							</div>
							<div className="flex justify-start">
								<Button
									variant="outline"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={(e) => {
										e.stopPropagation();
										setSharePos(pos);
									}}
								>
									<ShareIcon className="size-3" />
									Share
								</Button>
							</div>
						</div>
					);
				})}
			</div>
			{sharePos ? (
				<ClosedPositionPnlShareDialog
					open={!!sharePos}
					onOpenChange={(o) => !o && setSharePos(null)}
					position={sharePos}
					pairLabel={pairLabel}
					poolAddress={pool}
					currency={currency}
				/>
			) : null}
		</>
	);
}
