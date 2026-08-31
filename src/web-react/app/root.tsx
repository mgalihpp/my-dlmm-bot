import { useEffect } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useNavigation,
} from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton } from "~/components/page-skeletons";
import {
	ClosedTableSkeleton,
	PositionsTableSkeleton,
} from "~/components/portfolio/portfolio-table-skeletons";
import { TopLoadingIndicator } from "~/components/top-loading-indicator";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { useTheme } from "~/hooks/use-theme";
import { useChartPreferenceStore } from "~/stores/chart-preference";
import type { Route } from "./+types/root";
import "./app.css";

function NavigationSkeleton() {
	const navigation = useNavigation();
	if (navigation.state === "idle" || !navigation.location) return null;
	const to = navigation.location.pathname;
	if (to === "/portfolio/active") {
		return (
			<DashboardShell title="Portfolio" wallet="loading" rpc="loading">
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
			</DashboardShell>
		);
	}
	if (to === "/portfolio/closed") {
		return (
			<DashboardShell title="Portfolio" wallet="loading" rpc="loading">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
						<div className="h-7 w-36 animate-pulse rounded bg-muted" />
						<div className="flex items-center gap-2">
							<div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
							<div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
						</div>
					</div>
					<ClosedTableSkeleton />
				</div>
			</DashboardShell>
		);
	}
	return (
		<DashboardShell title="Loading" wallet="loading" rpc="loading">
			<PageSkeleton />
		</DashboardShell>
	);
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" type="image/png" href="/logo.png" />
				<Meta />
				<Links />
				<script
					suppressHydrationWarning
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static string, no user input — applies saved theme before hydration
					dangerouslySetInnerHTML={{
						__html: `(()=>{try{const t=localStorage.getItem("vexis-theme");const d=t==="dark"||(t==null&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
					}}
				/>
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	useTheme();
	useEffect(() => {
		useChartPreferenceStore.persist.rehydrate();
	}, []);
	const navigation = useNavigation();
	const isNavigating =
		navigation.state !== "idle" && navigation.location != null;
	return (
		<TooltipProvider delayDuration={0}>
			<TopLoadingIndicator />
			{isNavigating ? <NavigationSkeleton /> : <Outlet />}
			<Toaster />
		</TooltipProvider>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
		console.error(error);
	}

	return (
		<main className="container mx-auto p-4 pt-16">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full overflow-x-auto p-4">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
