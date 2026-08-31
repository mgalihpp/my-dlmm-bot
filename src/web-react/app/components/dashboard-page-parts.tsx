import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function RefreshButton({
	loading,
	onClick,
}: {
	loading: boolean;
	onClick: () => void;
}) {
	return (
		<Button variant="outline" size="lg" onClick={onClick} disabled={loading}>
			<RefreshCwIcon className={loading ? "animate-spin" : ""} />
			Refresh
		</Button>
	);
}

export function LoadErrorCard({
	title,
	error,
}: {
	title: string;
	error?: string;
}) {
	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-destructive">
					<AlertCircleIcon className="size-5" />
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className="text-sm text-muted-foreground">
				{error ?? "Unknown error"} — check the backend connection and try
				refreshing.
			</CardContent>
		</Card>
	);
}
