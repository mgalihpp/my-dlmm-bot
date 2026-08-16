import { MoonIcon, SunIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "~/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useTheme } from "~/hooks/use-theme";

export function PreferencesCard() {
	const [theme, setTheme] = useTheme();
	return (
		<Card>
			<CardHeader>
				<CardTitle>Preferences</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 @container/main lg:grid-cols-2">
				<Field>
					<FieldLabel>Theme</FieldLabel>
					<FieldContent>
						<ToggleGroup
							type="single"
							variant="outline"
							size="sm"
							value={theme}
							onValueChange={(v) => {
								if (v === "light" || v === "dark") setTheme(v);
							}}
						>
							<ToggleGroupItem value="light" aria-label="Light theme">
								<SunIcon className="size-4" />
								Light
							</ToggleGroupItem>
							<ToggleGroupItem value="dark" aria-label="Dark theme">
								<MoonIcon className="size-4" />
								Dark
							</ToggleGroupItem>
						</ToggleGroup>
					</FieldContent>
					<FieldDescription>
						Saved in your browser; the dashboard follows your choice on every
						visit.
					</FieldDescription>
				</Field>
			</CardContent>
		</Card>
	);
}
