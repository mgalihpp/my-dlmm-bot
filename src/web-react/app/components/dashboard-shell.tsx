import type { ReactNode } from "react";
import { AppSidebar } from "~/components/app-sidebar";
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
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						{children}
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
