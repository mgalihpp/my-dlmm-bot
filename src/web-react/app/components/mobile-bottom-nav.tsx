import type { LucideIcon } from "lucide-react";
import { Bot, CandlestickChart, PieChart, Settings2Icon } from "lucide-react";
import { memo } from "react";
import { NavLink } from "react-router";
import { cn } from "~/lib/utils";

export const MOBILE_NAV_ITEMS: {
	title: string;
	url: string;
	icon: LucideIcon;
}[] = [
	{ title: "Portfolio", url: "/portfolio", icon: PieChart },
	{ title: "Agent", url: "/agent", icon: Bot },
	{ title: "Pools", url: "/pools", icon: CandlestickChart },
	{ title: "Settings", url: "/settings", icon: Settings2Icon },
];

function MobileBottomNavInner() {
	return (
		<nav
			aria-label="Mobile navigation"
			className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
		>
			<div className="mx-auto flex h-16 max-w-lg items-stretch justify-around">
				{MOBILE_NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					return (
						<NavLink
							key={item.title}
							to={item.url}
							prefetch="intent"
							className={({ isActive }) =>
								cn(
									"flex min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium text-sidebar-foreground/60 transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
									isActive &&
										"bg-sidebar-accent text-sidebar-accent-foreground",
								)
							}
						>
							<Icon className="size-5" aria-hidden="true" />
							<span>{item.title}</span>
						</NavLink>
					);
				})}
			</div>
		</nav>
	);
}

export const MobileBottomNav = memo(MobileBottomNavInner);
