import { NavLink } from "react-router";
import { cn } from "~/lib/utils";

const ITEMS = [
	{ title: "Overview", url: "/portfolio" },
	{ title: "Active", url: "/portfolio/active" },
	{ title: "Closed", url: "/portfolio/closed" },
] as const;

export function PortfolioSubNav() {
	return (
		<nav
			aria-label="Portfolio sections"
			className="border-b bg-background md:hidden"
		>
			<div className="grid grid-cols-3">
				{ITEMS.map((item) => (
					<NavLink
						key={item.url}
						to={item.url}
						end={item.url === "/portfolio"}
						className={({ isActive }) =>
							cn(
								"flex items-center justify-center border-b-2 border-transparent py-2.5 text-center text-sm font-medium text-muted-foreground",
								isActive && "border-foreground text-foreground",
							)
						}
					>
						{item.title}
					</NavLink>
				))}
			</div>
		</nav>
	);
}
