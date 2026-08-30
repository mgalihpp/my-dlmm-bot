import { PortfolioActivePage } from "~/components/portfolio/portfolio-active-page";
import { RouteError } from "~/components/route-error";
import { PositionsTableSkeleton } from "~/components/portfolio/portfolio-table-skeletons";
import { closePosition } from "~/lib/server/close.server";
import { fetchActivePortfolio } from "~/lib/server/portfolio.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/portfolio-active";

export function ErrorBoundary() {
	return <RouteError title="Failed to load portfolio" shellTitle="Portfolio" />;
}

export function HydrateFallback() {
	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
				<div className="h-7 w-36 animate-pulse rounded bg-muted" />
				<div className="flex items-center gap-2">
					<div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
					<div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
				</div>
			</div>
			<PositionsTableSkeleton />
		</div>
	);
}

export const meta: Route.MetaFunction = () => [{ title: "Active Positions | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader(_args: Route.LoaderArgs) {
	return fetchActivePortfolio();
}

export async function action({ request }: Route.ActionArgs) {
	const form = await request.formData();
	const op = String(form.get("op") ?? "");
	if (op !== "close") {
		return { ok: false, error: "Unknown op" } as const;
	}
	const pool = String(form.get("pool") ?? "");
	const position = String(form.get("position") ?? "");
	const poolName = String(form.get("poolName") ?? "");
	return closePosition(pool, position, poolName);
}

export default PortfolioActivePage;
