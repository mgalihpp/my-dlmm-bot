import type { ReactNode } from "react";
import { AppSidebar } from "~/components/app-sidebar";
import { MobileBottomNav } from "~/components/mobile-bottom-nav";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { useRealtimeRevalidate } from "~/hooks/use-realtime";

export function DashboardShell({
	title = "Documents",
	wallet,
	rpc,
	realtimeMs = 10_000,
	children,
}: {
	title?: string;
	wallet?: string;
	rpc?: string;
	realtimeMs?: number;
	children: ReactNode;
}) {
	useRealtimeRevalidate(realtimeMs);
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
