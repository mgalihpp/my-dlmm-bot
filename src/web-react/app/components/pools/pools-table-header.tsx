import { TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { PoolSortKey, SortDir } from "~/lib/pools";

function SortableHead({
	label,
	k,
	sortKey,
	sortDir,
	onToggle,
}: {
	label: string;
	k: PoolSortKey;
	sortKey: PoolSortKey;
	sortDir: SortDir;
	onToggle: (k: PoolSortKey) => void;
}) {
	return (
		<TableHead>
			<button
				type="button"
				className="inline-flex items-center gap-1 hover:text-foreground"
				onClick={() => onToggle(k)}
			>
				{label}
				<span className="text-[10px] text-muted-foreground">
					{sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
				</span>
			</button>
		</TableHead>
	);
}

const headers: readonly [string, PoolSortKey][] = [
	["Pool", "pool"],
	["Price", "price"],
	["MC", "mcap"],
	["TVL", "tvl"],
	["Volume", "volume"],
	["Fee", "fee"],
	["Bin", "binStep"],
	["Organic", "organicScore"],
	["Rug", "rugScore"],
	["From ATH", "fromAthPct"],
	["Trend", "priceChangePct"],
];

export function PoolsTableHeader({
	sortKey,
	sortDir,
	onToggle,
}: {
	sortKey: PoolSortKey;
	sortDir: SortDir;
	onToggle: (key: PoolSortKey) => void;
}) {
	return (
		<TableHeader className="bg-muted/50">
			<TableRow>
				{headers.map(([label, key]) => (
					<SortableHead
						key={key}
						label={label}
						k={key}
						sortKey={sortKey}
						sortDir={sortDir}
						onToggle={onToggle}
					/>
				))}
			</TableRow>
		</TableHeader>
	);
}
