import { Skeleton } from "~/components/ui/skeleton";
import { keys } from "./shared";

export function SettingsPageSkeleton() {
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-8">
			<div className="space-y-2">
				<Skeleton className="h-9 w-32" />
				<Skeleton className="h-4 w-52" />
			</div>
			<div className="flex flex-col items-center gap-4 py-2">
				<Skeleton className="size-24 rounded-full" />
				<div className="flex w-full flex-col items-center gap-2">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-5 w-48" />
				</div>
			</div>
			<div className="flex flex-col gap-6">
				{keys(4).map((group) => (
					<section key={group}>
						<Skeleton className="mb-2 ml-1 h-4 w-20" />
						<div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
							{keys(group === 2 ? 2 : 1).map((row) => (
								<div
									key={row}
									className="flex h-[73px] items-center gap-3 border-b border-border/60 px-4 last:border-b-0"
								>
									<Skeleton className="size-9 rounded-xl" />
									<div className="flex min-w-0 flex-1 flex-col gap-2">
										<Skeleton className="h-4 w-24" />
										<Skeleton className="h-3 w-44" />
									</div>
									<Skeleton className="size-5" />
								</div>
							))}
						</div>
					</section>
				))}
				<Skeleton className="h-14 w-full rounded-2xl" />
			</div>
		</div>
	);
}
