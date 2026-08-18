import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	CopyIcon,
	SearchIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CurrencyIcon } from "~/components/currency-icon";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ViewSwitcher } from "~/components/view-switcher";
import { useIsMobile } from "~/hooks/use-mobile";
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
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import {
	getDefaultViewMode,
	readViewPreference,
	type ViewMode,
	writeViewPreference,
} from "~/lib/view-preference";
import type { Currency, RangeFilter } from "./portfolio-page";
import { RangeVisual } from "./range-visual";

type SortKey = "pair" | "balances" | "fees" | "pnl" | "pnlSol";
type SortDir = "asc" | "desc";

export function matchesRangeFilter(
	pool: Pick<OpenPoolWithIcons, "outOfRange" | "positionsOutOfRange">,
	filter: RangeFilter,
): boolean {
	const oor = pool.outOfRange === true || pool.positionsOutOfRange.length > 0;
	return filter === "all" || (filter === "oor" ? oor : !oor);
}

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

function PoolCell({ pool }: { pool: OpenPoolWithIcons }) {
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

function PortfolioAmount({
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

function PositionsCardDetail({
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
							<span className="text-xs text-muted-foreground">
								Age {formatAge(live.createdAt)}
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
								<div className="tabular-nums text-muted-foreground">
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
								<div className="tabular-nums text-muted-foreground">
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

function PositionsDetail({ pool }: { pool: OpenPoolWithIcons }) {
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

function OpenPositionCard({
	pool,
	onDetails,
	currency,
	solPrice,
}: {
	pool: OpenPoolWithIcons;
	onDetails: () => void;
	currency: Currency;
	solPrice: number | null;
}) {
	const oor = pool.outOfRange === true || pool.positionsOutOfRange.length > 0;
	const pnlUsd = parseFloat(pool.pnl);
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
						{pool.tokenXIcon ? (
							<img
								src={pool.tokenXIcon}
								alt={pool.tokenX}
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
				<Badge variant={oor ? "destructive" : "secondary"}>
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
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
						<PortfolioAmount
							usd={pool.pnl}
							sol={pool.pnlSol}
							currency={currency}
							solPrice={solPrice}
						/>
					</span>
				</div>
			</div>
			<div className="mt-4">
				<RangeVisual
					ranges={pool.positionsRange ?? []}
					current={pool.poolPrice}
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

export function PositionsTable({
	pools,
	rangeFilter,
	onRangeFilterChange,
	currency,
	solPrice,
}: {
	pools: readonly OpenPoolWithIcons[];
	rangeFilter: RangeFilter;
	onRangeFilterChange: (f: RangeFilter) => void;
	currency: Currency;
	solPrice: number | null;
}) {
	const isMobile = useIsMobile();
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("balances");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [selectedCard, setSelectedCard] = useState<OpenPoolWithIcons | null>(
		null,
	);
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [viewReady, setViewReady] = useState(false);

	useEffect(() => {
		setViewMode(
			readViewPreference(
				window.localStorage,
				"vexis:portfolio:open-view",
				getDefaultViewMode(window.innerWidth),
			),
		);
		setViewReady(true);
	}, []);

	const changeViewMode = (mode: ViewMode) => {
		setViewMode(mode);
		writeViewPreference(window.localStorage, "vexis:portfolio:open-view", mode);
	};

	const filtered = useMemo(() => {
		let rows = pools;
		if (rangeFilter !== "all") {
			rows = rows.filter((pool) => matchesRangeFilter(pool, rangeFilter));
		}
		if (search.trim().length > 0) {
			const q = search.trim().toLowerCase();
			rows = rows.filter(
				(pool) =>
					pool.tokenX.toLowerCase().includes(q) ||
					pool.tokenY.toLowerCase().includes(q) ||
					pool.poolAddress.toLowerCase().includes(q),
			);
		}
		const dir = sortDir === "asc" ? 1 : -1;
		return [...rows].sort((a, b) => {
			let av: number | string = 0;
			let bv: number | string = 0;
			if (sortKey === "pair") {
				av = pair(a.tokenX, a.tokenY);
				bv = pair(b.tokenX, b.tokenY);
			} else if (sortKey === "balances") {
				av = parseFloat(a.balances) || 0;
				bv = parseFloat(b.balances) || 0;
			} else if (sortKey === "fees") {
				av = parseFloat(a.unclaimedFees) || 0;
				bv = parseFloat(b.unclaimedFees) || 0;
			} else if (sortKey === "pnl") {
				av = parseFloat(a.pnl) || 0;
				bv = parseFloat(b.pnl) || 0;
			} else if (sortKey === "pnlSol") {
				av = parseFloat(a.pnlSol ?? "0") || 0;
				bv = parseFloat(b.pnlSol ?? "0") || 0;
			}
			return typeof av === "string"
				? av.localeCompare(bv as string) * dir
				: ((av as number) - (bv as number)) * dir;
		});
	}, [pools, rangeFilter, search, sortKey, sortDir]);

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("desc");
		}
	};

	const rangeCounts = useMemo(
		() => ({
			all: pools.length,
			inRange: pools.filter(
				(p) => p.outOfRange !== true && p.positionsOutOfRange.length === 0,
			).length,
			oor: pools.filter(
				(p) => p.outOfRange === true || p.positionsOutOfRange.length > 0,
			).length,
		}),
		[pools],
	);

	const SortableHead = ({ label, k }: { label: string; k: SortKey }) => (
		<TableHead>
			<button
				type="button"
				className="inline-flex items-center gap-1 hover:text-foreground"
				onClick={() => toggleSort(k)}
			>
				{label}
				<span className="text-[10px] text-muted-foreground">
					{sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
				</span>
			</button>
		</TableHead>
	);

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Open Positions</CardTitle>
					<p className="text-sm text-muted-foreground">
						{filtered.length} of {pools.length} pools
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<ViewSwitcher
						value={viewMode}
						onValueChange={changeViewMode}
						label="Open positions view"
					/>
					<Tabs
						value={rangeFilter}
						onValueChange={(v) => onRangeFilterChange(v as RangeFilter)}
					>
						<TabsList>
							<TabsTrigger value="all">
								All <Badge variant="secondary">{rangeCounts.all}</Badge>
							</TabsTrigger>
							<TabsTrigger value="in-range">
								In range{" "}
								<Badge variant="secondary">{rangeCounts.inRange}</Badge>
							</TabsTrigger>
							<TabsTrigger value="oor">
								OOR <Badge variant="secondary">{rangeCounts.oor}</Badge>
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<label htmlFor="search" className="relative">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search pool…"
							className="h-9 w-44 pl-8"
						/>
						<span className="sr-only">Search pools</span>
					</label>
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{filtered.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No open positions{search ? " matching the search" : ""}.
					</div>
				) : !viewReady ? null : viewMode === "card" ? (
					<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
						{filtered.map((pool) => (
							<OpenPositionCard
								key={pool.poolAddress}
								pool={pool}
								currency={currency}
								solPrice={solPrice}
								onDetails={() => setSelectedCard(pool)}
							/>
						))}
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<TableHead className="w-8" />
									<SortableHead label="Pool" k="pair" />
									<TableHead>Bin</TableHead>
									<SortableHead label="Balance" k="balances" />
									<SortableHead label="Fees" k="fees" />
									<SortableHead label="PnL USD" k="pnl" />
									<SortableHead label="PnL SOL" k="pnlSol" />
									<TableHead>Range</TableHead>
									<TableHead className="min-w-40">Visual Range</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((pool) => {
									const oor =
										pool.outOfRange === true ||
										pool.positionsOutOfRange.length > 0;
									const pnlUsd = parseFloat(pool.pnl);
									const pnlSolVal =
										pool.pnlSol != null ? parseFloat(pool.pnlSol) : null;
									const pnlPct = parseFloat(pool.pnlPctChange);
									const pnlSolPct =
										pool.pnlSolPctChange != null
											? parseFloat(pool.pnlSolPctChange)
											: null;
									const isOpen = expanded === pool.poolAddress;
									return (
										<Fragment key={pool.poolAddress}>
											<TableRow
												key={pool.poolAddress}
												className="cursor-pointer"
												onClick={() =>
													setExpanded(isOpen ? null : pool.poolAddress)
												}
											>
												<TableCell>
													<ChevronDownIcon
														className={cn(
															"size-4 text-muted-foreground transition-transform",
															isOpen && "rotate-180",
														)}
													/>
												</TableCell>
												<TableCell>
													<PoolCell pool={pool} />
												</TableCell>
												<TableCell className="tabular-nums">
													{pool.binStep}
												</TableCell>
												<TableCell className="tabular-nums">
													<PortfolioAmount
														usd={pool.balances}
														currency={currency}
														solPrice={solPrice}
													/>
												</TableCell>
												<TableCell className="tabular-nums">
													<PortfolioAmount
														usd={pool.unclaimedFees}
														currency={currency}
														solPrice={solPrice}
													/>
												</TableCell>
												<TableCell
													className={cn(
														"tabular-nums",
														pnlClass(pnlSign(pnlUsd)),
													)}
												>
													<PortfolioAmount
														usd={pool.pnl}
														sol={pool.pnlSol}
														currency="usd"
														solPrice={solPrice}
													/>
													<div className="text-xs text-muted-foreground">
														{fmtPct(pnlPct)}
													</div>
												</TableCell>
												<TableCell
													className={cn(
														"tabular-nums",
														pnlClass(pnlSign(pnlSolVal)),
													)}
												>
													<PortfolioAmount
														usd={pool.pnlSol}
														sol={pool.pnlSol}
														currency="sol"
														solPrice={solPrice}
													/>
													<div className="text-xs text-muted-foreground">
														{pnlSolPct !== null ? fmtPct(pnlSolPct) : "-"}
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant={oor ? "destructive" : "default"}
														className="gap-1"
													>
														{oor ? "OOR" : "IN RANGE"}
													</Badge>
													<div className="mt-1 text-xs text-muted-foreground">
														{pool.openPositionCount} position
														{pool.openPositionCount === 1 ? "" : "s"}
													</div>
												</TableCell>
												<TableCell>
													<RangeVisual
														ranges={pool.positionsRange ?? []}
														current={pool.poolPrice}
													/>
												</TableCell>
											</TableRow>
											{isOpen ? (
												<TableRow key={`${pool.poolAddress}-detail`}>
													<TableCell colSpan={9} className="bg-muted/20 p-0">
														<PositionsDetail pool={pool} />
													</TableCell>
												</TableRow>
											) : null}
										</Fragment>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
			<Sheet
				open={selectedCard !== null}
				onOpenChange={(open) => !open && setSelectedCard(null)}
			>
				<SheetContent
					side={isMobile ? "bottom" : "right"}
					className="!h-[90dvh] !max-h-[90dvh] overflow-y-auto sm:!h-auto sm:!max-h-none"
				>
					<SheetHeader>
						<SheetTitle>
							{selectedCard
								? pair(selectedCard.tokenX, selectedCard.tokenY)
								: "Position details"}
						</SheetTitle>
						<SheetDescription>
							{selectedCard
								? shortAddr(selectedCard.poolAddress, 6)
								: "Open position details"}
						</SheetDescription>
					</SheetHeader>
					{selectedCard ? (
						<PositionsCardDetail
							pool={selectedCard}
							currency={currency}
							solPrice={solPrice}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</Card>
	);
}
