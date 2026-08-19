import type { PositionPnLData } from "@vexis/domain/position.js";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { CurrencyIcon } from "~/components/currency-icon";
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
	shortAddr,
	solscanAccountUrl,
	tsLocal,
} from "~/lib/format";
import { cn } from "~/lib/utils";
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
}: {
	usd: string | number | null | undefined;
	sol?: string | number | null;
	currency: Currency;
}) {
	const formatted =
		sol != null
			? fmtPnl(usd, sol, currency)
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
			<div className="overflow-x-auto px-4 py-4">
				<Table className="min-w-[760px] rounded-md border">
					<TableHeader className="bg-muted/50">
						<TableRow>
							{DETAIL_COLUMNS.map((column) => (
								<TableHead key={column}>{column}</TableHead>
							))}
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
										/>
									</TableCell>
									<TableCell className="tabular-nums">
										<PortfolioAmount
											usd={pos.allTimeWithdrawals.total.usd}
											sol={pos.allTimeWithdrawals.total.sol}
											currency={currency}
										/>
									</TableCell>
									<TableCell className="tabular-nums">
										<PortfolioAmount
											usd={pos.allTimeFees.total.usd}
											sol={pos.allTimeFees.total.sol}
											currency={currency}
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
										/>
										<div className="text-xs text-muted-foreground">
											{fmtPct(pos.pnlSolPctChange ?? null)}
										</div>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{tsLocal(pos.closedAt)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		);
	return (
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
								/>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Withdraw</p>
								<PortfolioAmount
									usd={pos.allTimeWithdrawals.total.usd}
									sol={pos.allTimeWithdrawals.total.sol}
									currency={currency}
								/>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Fees</p>
								<PortfolioAmount
									usd={pos.allTimeFees.total.usd}
									sol={pos.allTimeFees.total.sol}
									currency={currency}
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
								<PortfolioAmount usd={pos.pnlSol} sol={pnlSol} currency="sol" />
								<p className="text-xs text-muted-foreground">
									{fmtPct(pos.pnlSolPctChange ?? null)}
								</p>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
