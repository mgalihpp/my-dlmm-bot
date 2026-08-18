import { EllipsisVerticalIcon, LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "~/components/ui/sidebar";
import { shortAddr } from "~/lib/format";

export function NavUser({
	user,
	wallet,
	rpc,
}: {
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	wallet?: string;
	rpc?: string;
}) {
	const { isMobile } = useSidebar();
	const displayName = wallet ? shortAddr(wallet, 6) : user.name;
	const displayEmail = wallet
		? (rpc?.replace(/^https?:\/\//, "") ?? "wallet")
		: user.email;

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="h-8 w-8 rounded-lg grayscale">
								<AvatarImage src={user.avatar} alt={displayName} />
								<AvatarFallback className="rounded-lg">VX</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{displayName}</span>
								<span className="truncate text-xs text-muted-foreground">
									{displayEmail}
								</span>
							</div>
							<EllipsisVerticalIcon className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src={user.avatar} alt={displayName} />
									<AvatarFallback className="rounded-lg">VX</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{displayName}</span>
									<span className="truncate text-xs text-muted-foreground">
										{displayEmail}
									</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{wallet ? (
							<>
								<DropdownMenuLabel className="px-3 py-1.5 text-xs font-normal text-muted-foreground">
									Wallet · {shortAddr(wallet, 8)}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
							</>
						) : null}
						<DropdownMenuItem asChild variant="destructive">
							<a href="/logout">
								<LogOutIcon />
								Log out
							</a>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
