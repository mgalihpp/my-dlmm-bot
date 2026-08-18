import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { shortAddr } from "~/lib/format";

export function ProfileCard({
	wallet,
	rpc,
}: {
	wallet?: string;
	rpc?: string;
}) {
	const displayName = wallet ? shortAddr(wallet, 6) : "Vexis User";
	const displayDetail = wallet
		? (rpc?.replace(/^https?:\/\//, "") ?? "wallet")
		: "Connected wallet";

	return (
		<div className="flex flex-col items-center py-2 text-center">
			<Avatar className="size-24 rounded-full bg-primary/10">
				<AvatarImage src="/logo.png" alt={displayName} />
				<AvatarFallback className="rounded-full text-2xl text-primary">
					VX
				</AvatarFallback>
			</Avatar>
			<div className="mt-4 w-full min-w-0">
				<p className="truncate text-xl font-semibold">{displayName}</p>
				<p className="truncate text-base text-muted-foreground">
					{displayDetail}
				</p>
			</div>
		</div>
	);
}
