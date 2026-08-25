import { useSearchParams } from "react-router";

export function WalletSwitcher({
	wallets,
	value,
}: {
	wallets: readonly { wallet: string; label?: string }[];
	value: string;
}) {
	const [params, setParams] = useSearchParams();
	if (wallets.length <= 1) return null;
	return (
		<label className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground">Wallet</span>
			<select
				value={value}
				onChange={(e) => {
					const next = new URLSearchParams(params);
					next.set("wallet", e.target.value);
					// reset pagination when switching wallet
					next.delete("page");
					next.delete("closedPage");
					setParams(next, { preventScrollReset: true });
				}}
				className="h-8 rounded-md border border-input bg-background px-2 text-sm"
			>
				{wallets.map((w) => (
					<option key={w.wallet} value={w.wallet}>
						{w.label ?? w.wallet.slice(0, 4)} — {w.wallet.slice(0, 4)}…
						{w.wallet.slice(-4)}
					</option>
				))}
			</select>
		</label>
	);
}
