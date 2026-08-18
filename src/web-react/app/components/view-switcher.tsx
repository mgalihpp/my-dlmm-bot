import { Grid2X2Icon, Table2Icon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
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
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={(next) => {
				if (next === "table" || next === "card") onValueChange(next);
			}}
			variant="outline"
			size="sm"
			aria-label={label}
		>
			<ToggleGroupItem value="table" aria-label="Table view">
				<Table2Icon />
				Table
			</ToggleGroupItem>
			<ToggleGroupItem value="card" aria-label="Card view">
				<Grid2X2Icon />
				Card
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
