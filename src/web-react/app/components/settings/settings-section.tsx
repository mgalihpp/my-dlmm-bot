import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EDITABLE_FIELDS, type Section } from "~/lib/server/settings.server";
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
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 @container/main lg:grid-cols-2">
				{fields.map((field) => (
					<FieldRow key={field.path} field={field} value={values[field.path]} />
				))}
			</CardContent>
		</Card>
	);
}
