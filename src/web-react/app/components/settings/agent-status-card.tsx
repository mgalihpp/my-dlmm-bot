import { PowerIcon } from "lucide-react";
import { useSubmit } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function AgentStatusCard({
	enabled,
	running,
	lastCycleAt,
}: {
	enabled: boolean;
	running: boolean;
	lastCycleAt: string | null;
}) {
	const submit = useSubmit();
	const toggle = () =>
		submit(
			{ op: "setAgentEnabled", enabled: enabled ? "false" : "true" },
			{ method: "post", replace: true },
		);
	const last =
		lastCycleAt != null ? new Date(lastCycleAt).toLocaleTimeString() : "never";
	const status = enabled ? (running ? "Running" : "Idle") : "Stopped";
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-3">
				<CardTitle>DLMM Agent</CardTitle>
				<Badge
					variant={enabled ? (running ? "default" : "secondary") : "outline"}
				>
					{status}
				</Badge>
			</CardHeader>
			<CardContent className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">
					Last cycle: {last} · config auto-reloads on save
				</p>
				<Button onClick={toggle} variant={enabled ? "destructive" : "default"}>
					<PowerIcon className="size-4" />
					{enabled ? "Stop Agent" : "Start Agent"}
				</Button>
			</CardContent>
		</Card>
	);
}
