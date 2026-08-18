import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EDITABLE_FIELDS, type Section } from "~/lib/settings";
import { FieldRow } from "./field-row";

export function SettingsSection({
	section,
	title,
	values,
}: {
	section: Section;
	title: string;
	values: Record<string, unknown>;
}) {
	const fields = EDITABLE_FIELDS.filter((f) => f.section === section);
	return (
		<Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
			<CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3">
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{fields.map((field) => (
					<FieldRow key={field.path} field={field} value={values[field.path]} />
				))}
			</CardContent>
		</Card>
	);
}
