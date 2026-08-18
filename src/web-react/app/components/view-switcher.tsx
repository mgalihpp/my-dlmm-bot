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
				<TabsTrigger value="table">Table</TabsTrigger>
				<TabsTrigger value="card">Card</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
