import { AlertTriangleIcon, CheckIcon, CopyIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { CurrencyIcon } from "~/components/currency-icon";
import { Button } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
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
	meteoraUrl,
	pair,
	pnlClass,
	pnlSign,
	shortAddr,
	solscanUrl,
} from "~/lib/format";
import { fmtAmount } from "~/lib/pools";
import type { CloseResult } from "~/lib/server/close.server";
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import type { Currency } from "./portfolio-page";
import { RangeVisual } from "./range-visual";

async function copy(text: string, label: string): Promise<boolean> {
	if (!navigator.clipboard) {
		toast.error(`Failed to copy ${label}`);
		return false;
	}
	try {
		await navigator.clipboard.writeText(text);
		toast.success(`${label} copied`);
		return true;
	} catch {
		toast.error(`Failed to copy ${label}`);
		return false;
	}
}

function CopyButton({
	text,
	label,
	className,
}: {
	text: string;
	label: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className={cn(
				"text-muted-foreground",
				copied && "text-emerald-500",
				className,
			)}
			onClick={async (e) => {
				e.preventDefault();
				e.stopPropagation();
				if (await copy(text, label)) {
					setCopied(true);
					setTimeout(() => setCopied(false), 2000);
				}
			}}
			aria-label={`Copy ${label}`}
		>
			{copied ? (
				<CheckIcon className="size-3" />
			) : (
				<CopyIcon className="size-3" />
			)}
		</Button>
	);
}

export function CloseConfirmPopover({
	pool,
	position,
	poolName,
	side,
	children,
}: {
	pool: string;
	position: string;
	poolName: string;
	side: "left" | "right";
	children: ReactNode;
}) {
	const fetcher = useFetcher<CloseResult>();
	const [open, setOpen] = useState(false);
	const submitting = fetcher.state !== "idle";

	useEffect(() => {
		if (fetcher.data?.ok) toast.success("Position closed");
		else if (fetcher.data && !fetcher.data.ok)
			toast.error(fetcher.data.error ?? "Failed to close position");
	}, [fetcher.data]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent side={side}>
				<div className="space-y-1">
					<h3 className="text-sm font-semibold">Close &amp; Zap Out</h3>
					<p className="text-sm text-muted-foreground">
						{poolName}
						{` · Position ${shortAddr(position, 6)}`}
					</p>
				</div>
				<div className="space-y-4">
					<p className="flex items-start gap-2 text-sm text-muted-foreground">
						<AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
						Remove all liquidity, claim fees, then swap to SOL via Jupiter. This
						action is irreversible.
					</p>
					{fetcher.data?.ok && fetcher.data.sig ? (
						<div className="space-y-2 text-sm">
							<p className="font-medium text-emerald-500">Position closed</p>
							<a
								href={solscanUrl(fetcher.data.sig)}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono text-xs text-muted-foreground underline"
							>
								{shortAddr(fetcher.data.sig, 12)}
							</a>
						</div>
					) : (
						<fetcher.Form method="post" className="flex justify-end gap-2">
							<input type="hidden" name="op" value="close" />
							<input type="hidden" name="pool" value={pool} />
							<input type="hidden" name="position" value={position} />
							<Button
								type="button"
								variant="outline"
								disabled={submitting}
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" variant="destructive" disabled={submitting}>
								{submitting ? "Closing…" : "Close & Zap Out"}
							</Button>
						</fetcher.Form>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function TokenIcon({
	icon,
	symbol,
	className,
}: {
	icon?: string | null;
	symbol: string;
	className?: string;
}) {
	if (!icon) return null;
	return (
		<img
			src={icon}
			alt={symbol}
			className={cn("h-4 w-4 shrink-0 rounded-full object-cover", className)}
			onError={(e) => {
				(e.currentTarget as HTMLImageElement).style.display = "none";
			}}
		/>
	);
}

function TokenLink({
	pool,
	symbol,
	mint,
}: {
	pool: OpenPoolWithIcons;
	symbol: string;
	mint: string;
}) {
	return (
		<span className="inline-flex items-center gap-1">
			<TokenIcon
				icon={symbol === pool.tokenX ? pool.tokenXIcon : pool.tokenYIcon}
				symbol={symbol}
			/>
			<a
				href={meteoraUrl(pool.poolAddress)}
				target="_blank"
				rel="noopener noreferrer"
				className="font-medium hover:underline"
			>
				{symbol}
			</a>
			<CopyButton text={mint} label={`${symbol} mint`} className="size-4" />
		</span>
	);
}

export function PoolCell({ pool }: { pool: OpenPoolWithIcons }) {
	const p = pair(pool.tokenX, pool.tokenY);
	return (
		<div className="flex items-center gap-3">
			<div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-bold">
				{pool.tokenXIcon ? (
					<img
						src={pool.tokenXIcon}
						alt={pool.tokenX}
						className="h-full w-full object-cover"
						onError={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = "none";
						}}
					/>
				) : (
					p.split("/")[0].slice(0, 2).toUpperCase()
				)}
			</div>
			<div className="flex flex-col">
				<div className="flex items-center gap-1.5">
					<a
						href={meteoraUrl(pool.poolAddress)}
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium hover:underline"
					>
						{p}
					</a>
					<CopyButton
						text={pool.poolAddress}
						label="Pool address"
						className="size-5"
					/>
				</div>
				<span className="font-mono text-xs text-muted-foreground">
					{shortAddr(pool.poolAddress, 5)}
				</span>
			</div>
		</div>
	);
}

function formatAge(createdAt: number | null | undefined): string {
	if (createdAt == null) return "-";
	const ageMs = Math.max(0, Date.now() - createdAt * 1000);
	const minutes = Math.floor(ageMs / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

export function PortfolioAmount({
	usd,
	sol,
	currency,
	solPrice,
}: {
	usd: string | number | null | undefined;
	sol?: string | number | null;
	currency: Currency;
	solPrice: number | null;
}) {
	const formatted =
		sol != null
			? fmtPnl(usd, sol, currency)
			: fmtAmount(usd, currency, solPrice);
	const value = currency === "sol" ? formatted.replace(/ SOL$/, "") : formatted;
	return (
		<span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums">
			<span>{value}</span>
			{value !== "-" ? <CurrencyIcon currency={currency} decorative /> : null}
		</span>
	);
}

export function PositionsCardDetail({
	pool,
	currency,
	solPrice,
}: {
	pool: OpenPoolWithIcons;
	currency: Currency;
	solPrice: number | null;
}) {
	const positions = (pool.positionsLive ?? []).map((live, i) => ({
		live,
		range: pool.positionsRange?.[i],
	}));
	const pnlUsd = parseFloat(pool.pnl);
	const pnlSol = pool.pnlSol != null ? parseFloat(pool.pnlSol) : null;
	const pnlPct = parseFloat(pool.pnlPctChange);
	const pnlSolPct =
		pool.pnlSolPctChange != null ? parseFloat(pool.pnlSolPctChange) : null;
	if (positions.length === 0) {
		return (
			<div className="px-4 py-6 text-center text-sm text-muted-foreground">
				No live position data for this pool.
			</div>
		);
	}
	return (
		<div className="space-y-4 px-4 py-4">
			<div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
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
				<div className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
					<p className="text-xs text-muted-foreground">PnL USD</p>
					<PortfolioAmount usd={pool.pnl} currency="usd" solPrice={solPrice} />
					<p className="text-xs text-muted-foreground">{fmtPct(pnlPct)}</p>
				</div>
				<div className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
					<p className="text-xs text-muted-foreground">PnL SOL</p>
					<PortfolioAmount
						usd={pool.pnlSol}
						sol={pool.pnlSol}
						currency="sol"
						solPrice={solPrice}
					/>
					<p className="text-xs text-muted-foreground">
						{pnlSolPct !== null ? fmtPct(pnlSolPct) : "-"}
					</p>
				</div>
			</div>
			<div className="space-y-3">
				{positions.map(({ live, range }) => (
					<div key={live.address} className="space-y-3 rounded-lg border p-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<a
									href={solscanUrl(live.address)}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-xs text-muted-foreground hover:underline"
								>
									{shortAddr(live.address, 6)}
								</a>
								<CopyButton
									text={live.address}
									label="Position address"
									className="ml-1 size-5"
								/>
							</div>
							<span className="flex items-center gap-2 text-xs text-muted-foreground">
								Age {formatAge(live.createdAt)}
								<CloseConfirmPopover
									pool={pool.poolAddress}
									position={live.address}
									poolName={pair(pool.tokenX, pool.tokenY)}
									side="left"
								>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-7 px-2 text-xs"
										onClick={(e) => e.stopPropagation()}
									>
										Close
									</Button>
								</CloseConfirmPopover>
							</span>
						</div>
						{range ? (
							<div className="rounded-md bg-muted/40 px-3 py-2">
								<p className="mb-1 text-xs text-muted-foreground">
									Range visual
								</p>
								<RangeVisual
									ranges={[range]}
									current={pool.poolPrice}
									className="border-0 [&_*]:border-0"
								/>
							</div>
						) : null}
						<div className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<p className="text-xs text-muted-foreground">Amount</p>
								<div className="tabular-nums">
									{Number(live.amountX).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenX}
										mint={pool.tokenXMint}
									/>
								</div>
								<div className="text-muted-foreground tabular-nums">
									{Number(live.amountY).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenY}
										mint={pool.tokenYMint}
									/>
								</div>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Fees</p>
								<div className="tabular-nums">
									{Number(live.feeX).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenX}
										mint={pool.tokenXMint}
									/>
								</div>
								<div className="text-muted-foreground tabular-nums">
									{Number(live.feeY).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenY}
										mint={pool.tokenYMint}
									/>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function PositionsDetail({ pool }: { pool: OpenPoolWithIcons }) {
	const positions = (pool.positionsLive ?? []).map((live, i) => ({
		live,
		range: pool.positionsRange?.[i],
	}));
	if (positions.length === 0)
		return (
			<div className="px-4 py-6 text-center text-sm text-muted-foreground">
				No live position data for this pool.
			</div>
		);
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader className="bg-muted/30">
					<TableRow>
						<TableHead>Position / Range</TableHead>
						<TableHead>Age</TableHead>
						<TableHead>Amount</TableHead>
						<TableHead>Fees</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{positions.map(({ live, range }) => (
						<TableRow key={live.address}>
							<TableCell>
								<a
									href={solscanUrl(live.address)}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-xs text-muted-foreground hover:underline"
								>
									{shortAddr(live.address, 6)}
								</a>
								{range ? (
									<div className="mt-1 text-xs text-muted-foreground">
										{Number(range.minPrice).toFixed(5)} –{" "}
										{Number(range.maxPrice).toFixed(5)}
									</div>
								) : null}
							</TableCell>
							<TableCell className="whitespace-nowrap text-muted-foreground">
								{formatAge(live.createdAt)}
							</TableCell>
							<TableCell className="min-w-44 tabular-nums">
								<div>
									{Number(live.amountX).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenX}
										mint={pool.tokenXMint}
									/>
								</div>
								<div className="text-xs text-muted-foreground">
									{Number(live.amountY).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenY}
										mint={pool.tokenYMint}
									/>
								</div>
							</TableCell>
							<TableCell className="min-w-44 tabular-nums">
								<div>
									{Number(live.feeX).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenX}
										mint={pool.tokenXMint}
									/>
								</div>
								<div className="text-xs text-muted-foreground">
									{Number(live.feeY).toFixed(4)}{" "}
									<TokenLink
										pool={pool}
										symbol={pool.tokenY}
										mint={pool.tokenYMint}
									/>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
