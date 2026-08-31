import { MoonIcon, SunIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "~/components/ui/field";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";

type ViewTransitionDocument = Document & {
	startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

export function PreferencesCard() {
	const [theme, setTheme] = useTheme();

	const changeTheme = (
		next: "light" | "dark",
		event: MouseEvent<HTMLButtonElement>,
	) => {
		if (next === theme) return;
		const x = event.clientX;
		const y = event.clientY;
		const endRadius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y),
		);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setTheme(next);
			return;
		}
		const startViewTransition = (document as ViewTransitionDocument)
			.startViewTransition;

		if (!startViewTransition) {
			setTheme(next);
			return;
		}

		const transition = startViewTransition.call(document, () => {
			flushSync(() => setTheme(next));
		});
		void transition.ready.then(() => {
			document.documentElement.animate(
				{
					clipPath: [
						`circle(0px at ${x}px ${y}px)`,
						`circle(${endRadius}px at ${x}px ${y}px)`,
					],
				},
				{
					duration: 500,
					easing: "ease-in-out",
					pseudoElement: "::view-transition-new(root)",
				},
			);
		});
	};

	return (
		<Card>
			<CardHeader className="border-b">
				<CardTitle>Appearance</CardTitle>
				<CardDescription>
					Set the visual tone for your dashboard.
				</CardDescription>
			</CardHeader>
			<CardContent className="@container/main grid gap-6 pt-5 lg:grid-cols-2">
				<Field>
					<FieldLabel>Theme</FieldLabel>
					<FieldContent>
						<div className="grid gap-2 sm:grid-cols-2">
							{(
								[
									[
										"light",
										SunIcon,
										"Light",
										"Bright surfaces and crisp contrast.",
									],
									[
										"dark",
										MoonIcon,
										"Dark",
										"Low-glare tones for late sessions.",
									],
								] as const
							).map(([value, Icon, label, description]) => (
								<button
									key={value}
									type="button"
									aria-pressed={theme === value}
									onClick={(event) => changeTheme(value, event)}
									className={cn(
										"flex min-h-24 flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
										theme === value && "border-primary bg-primary/5",
									)}
								>
									<span className="flex items-center gap-2 text-sm font-medium">
										<Icon className="size-4" />
										{label}
									</span>
									<span className="text-xs text-muted-foreground">
										{description}
									</span>
								</button>
							))}
						</div>
					</FieldContent>
					<FieldDescription>
						Saved in your browser and restored on your next visit.
					</FieldDescription>
				</Field>
			</CardContent>
		</Card>
	);
}
