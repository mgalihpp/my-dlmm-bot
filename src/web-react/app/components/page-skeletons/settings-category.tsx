import { useLocation } from "react-router";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { EDITABLE_FIELDS } from "~/lib/settings";
import { keys } from "./shared";

export function SettingsCategoryPageSkeleton() {
	const category = useLocation().pathname.split("/").filter(Boolean).at(-1);
	const fieldCount = EDITABLE_FIELDS.filter(
		(field) => field.section === category,
	).length;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:py-8">
			<div className="space-y-3">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-9 w-36" />
			</div>
			{category === "agent" && (
				<Card>
					<CardHeader className="flex-row items-center justify-between gap-3">
						<Skeleton className="h-5 w-28" />
						<Skeleton className="h-6 w-16 rounded-full" />
					</CardHeader>
					<CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
						<Skeleton className="h-4 w-64" />
						<Skeleton className="h-9 w-28" />
					</CardContent>
				</Card>
			)}
			{category === "preferences" ? (
				<Card>
					<CardHeader className="border-b">
						<Skeleton className="h-5 w-24" />
						<Skeleton className="h-4 w-56" />
					</CardHeader>
					<CardContent className="space-y-4 pt-5">
						<Skeleton className="h-4 w-16" />
						<div className="grid gap-2 sm:grid-cols-2">
							<Skeleton className="h-24 rounded-lg" />
							<Skeleton className="h-24 rounded-lg" />
						</div>
					</CardContent>
				</Card>
			) : (
				<Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
					<CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3">
						<Skeleton className="h-5 w-28" />
					</CardHeader>
					<CardContent className="space-y-0 p-0">
						{keys(Math.max(fieldCount, 3)).map((field) => (
							<div
								key={field}
								className="flex min-h-14 items-center gap-4 border-b border-border/60 px-4 last:border-b-0"
							>
								<Skeleton className="h-4 w-32" />
								<Skeleton className="ml-auto h-9 w-[42%]" />
							</div>
						))}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
