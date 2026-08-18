import { SearchIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ViewSwitcher } from "~/components/view-switcher";
import type { ViewMode } from "~/lib/view-preference";
import type { RangeFilter } from "./portfolio-page";

export function PositionsTableToolbar({
	viewMode,
	onViewModeChange,
	rangeFilter,
	onRangeFilterChange,
	rangeCounts,
	search,
	onSearchChange,
}: {
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
	rangeFilter: RangeFilter;
	onRangeFilterChange: (filter: RangeFilter) => void;
	rangeCounts: { all: number; inRange: number; oor: number };
	search: string;
	onSearchChange: (search: string) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<ViewSwitcher
				value={viewMode}
				onValueChange={onViewModeChange}
				label="Open positions view"
			/>
			<Tabs
				value={rangeFilter}
				onValueChange={(value) => onRangeFilterChange(value as RangeFilter)}
			>
				<TabsList>
					<TabsTrigger value="all">
						All <Badge variant="secondary">{rangeCounts.all}</Badge>
					</TabsTrigger>
					<TabsTrigger value="in-range">
						In range <Badge variant="secondary">{rangeCounts.inRange}</Badge>
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
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="Search pool…"
					className="h-9 w-44 pl-8"
				/>
				<span className="sr-only">Search pools</span>
			</label>
		</div>
	);
}
