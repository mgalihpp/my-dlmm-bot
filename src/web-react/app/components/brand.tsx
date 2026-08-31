import { cn } from "~/lib/utils";

export function Brand({ className }: { className?: string }) {
	return (
		<a href="/portfolio" className={cn("flex items-center gap-2", className)}>
			<img src="/logo.png" alt="Vexis logo" width={80} className="-ml-6" />
			<div className="-ml-6 text-base font-semibold">Vexis</div>
		</a>
	);
}
