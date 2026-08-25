import { type ReactNode, useMemo } from "react";
import { AppSidebar } from "~/components/app-sidebar";
import { MobileBottomNav } from "~/components/mobile-bottom-nav";
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
	const sidebar = useMemo(
		() => <AppSidebar wallet={wallet} rpc={rpc} />,
		[wallet, rpc],
	);
	const header = useMemo(() => <SiteHeader title={title} />, [title]);
	const mobileNav = useMemo(() => <MobileBottomNav />, []);

	return (
		<SidebarProvider
			style={
				{
					"--sidebar-width": "calc(var(--spacing) * 60)",
					"--header-height": "calc(var(--spacing) * 12)",
				} as React.CSSProperties
			}
		>
			{sidebar}
			<SidebarInset>
				{header}
				<div className="flex flex-1 flex-col pb-20 md:pb-0">
					<div className="@container/main flex flex-1 flex-col gap-2">
						{children}
					</div>
				</div>
			</SidebarInset>
			{mobileNav}
		</SidebarProvider>
	);
}
