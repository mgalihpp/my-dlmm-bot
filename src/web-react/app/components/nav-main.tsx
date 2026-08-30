import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";

type NavSubItem = {
	title: string;
	url: string;
};

type NavItem = {
	title: string;
	url: string;
	icon?: React.ReactNode;
	prefetch?: "intent" | "render";
	items?: NavSubItem[];
};

export function NavMain({ items }: { items: NavItem[] }) {
	const { pathname } = useLocation();

	return (
		<SidebarGroup>
			<SidebarGroupContent className="flex flex-col gap-2">
				<SidebarMenu>
					{items.map((item) => {
						const hasSub = item.items && item.items.length > 0;
						const isParentActive =
							pathname === item.url || pathname.startsWith(`${item.url}/`);
						if (hasSub) {
							return (
								<CollapsibleNavItem
									key={item.title}
									item={item}
									isParentActive={isParentActive}
									pathname={pathname}
								/>
							);
						}
						return (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									asChild
									tooltip={item.title}
									isActive={pathname === item.url}
								>
									<NavLink to={item.url} prefetch={item.prefetch ?? "intent"}>
										{item.icon}
										<span>{item.title}</span>
									</NavLink>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function CollapsibleNavItem({
	item,
	isParentActive,
	pathname,
}: {
	item: NavItem;
	isParentActive: boolean;
	pathname: string;
}) {
	const [open, setOpen] = useState(isParentActive);

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				tooltip={item.title}
				isActive={isParentActive}
				onClick={() => setOpen((v) => !v)}
				className="justify-between"
			>
				<span className="flex items-center gap-2">
					{item.icon}
					<span>{item.title}</span>
				</span>
				<ChevronRight
					className={cn(
						"size-4 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
			</SidebarMenuButton>
			{open && (
				<SidebarMenuSub>
					{item.items?.map((sub) => (
						<SidebarMenuSubItem key={sub.title}>
							<SidebarMenuSubButton asChild isActive={pathname === sub.url}>
								<NavLink to={sub.url} prefetch="intent">
									<span>{sub.title}</span>
								</NavLink>
							</SidebarMenuSubButton>
						</SidebarMenuSubItem>
					))}
				</SidebarMenuSub>
			)}
		</SidebarMenuItem>
	);
}
