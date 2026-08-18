import { Grid2X2Icon, Table2Icon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { ViewMode } from "~/lib/view-preference";

export function ViewSwitcher({
	value,
	onValueChange,
	label,
}: {
	value: ViewMode;
	onValueChange: (value: ViewMode) => void;
	label: string;
}) {
	return (
		<Tabs
			value={value}
			onValueChange={(next) => {
				if (next === "table" || next === "card") onValueChange(next);
			}}
		>
			<TabsList aria-label={label}>
				<TabsTrigger value="table" aria-label="Table view" title="Table view">
					<Table2Icon />
				</TabsTrigger>
				<TabsTrigger value="card" aria-label="Card view" title="Card view">
					<Grid2X2Icon />
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
