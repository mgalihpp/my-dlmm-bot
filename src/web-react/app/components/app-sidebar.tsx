import {
	Bot,
	CandlestickChart,
	CircleHelpIcon,
	PieChart,
	SearchIcon,
	Settings2Icon,
} from "lucide-react";
import type * as React from "react";
import { Brand } from "~/components/brand";
import { NavMain } from "~/components/nav-main";
import { NavSecondary } from "~/components/nav-secondary";
import { NavUser } from "~/components/nav-user";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "~/components/ui/sidebar";

const data = {
	user: {
		name: "Vexis User",
		email: "Connected wallet",
		avatar: "/logo.png",
	},
	navMain: [
		{
			title: "Portfolio",
			url: "/portfolio",
			icon: <PieChart />,
		},
		{
			title: "Agent",
			url: "/agent",
			icon: <Bot />,
		},
		{
			title: "Pools",
			url: "/pools",
			icon: <CandlestickChart />,
		},
	],
	navSecondary: [
		{
			title: "Settings",
			url: "/settings",
			icon: <Settings2Icon />,
		},
		{
			title: "Get Help",
			url: "#",
			icon: <CircleHelpIcon />,
		},
		{
			title: "Search",
			url: "#",
			icon: <SearchIcon />,
		},
	],
};

export function AppSidebar({
	wallet,
	rpc,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	wallet?: string;
	rpc?: string;
}) {
	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader className="border-b border-sidebar-border">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className="data-[slot=sidebar-menu-button]:p-1.5!"
						>
							<Brand />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
				{/*<NavDocuments items={data.documents} />*/}
				<NavSecondary items={data.navSecondary} className="mt-auto" />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={data.user} wallet={wallet} rpc={rpc} />
			</SidebarFooter>
		</Sidebar>
	);
}
