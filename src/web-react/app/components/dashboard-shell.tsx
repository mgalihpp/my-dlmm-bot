import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { AppSidebar } from "~/components/app-sidebar";
import { MobileBottomNav } from "~/components/mobile-bottom-nav";
import { PortfolioSubNav } from "~/components/portfolio/portfolio-subnav";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

export function DashboardShell({
	title = "Documents",
	wallet,
	rpc,
	children,
}: {
	title?: string;
	wallet?: string;
	rpc?: string;
	children: ReactNode;
}) {
	const { pathname } = useLocation();
	const showPortfolioSubNav =
		pathname === "/portfolio" || pathname.startsWith("/portfolio/");

	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width": "calc(var(--spacing) * 60)",
					"--header-height": "calc(var(--spacing) * 12)",
				} as React.CSSProperties
			}
		>
			<AppSidebar wallet={wallet} rpc={rpc} />
			<SidebarInset>
				<SiteHeader title={title} />
				{showPortfolioSubNav ? <PortfolioSubNav /> : null}
				<div className="flex flex-1 flex-col pb-20 md:pb-0">
					<div className="@container/main flex flex-1 flex-col gap-2">
						{children}
					</div>
				</div>
			</SidebarInset>
			<MobileBottomNav />
		</SidebarProvider>
	);
}
