import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

export function TopLoadingIndicator() {
	const navigation = useNavigation();
	const [phase, setPhase] = useState<"idle" | "loading" | "finishing">("idle");

	useEffect(() => {
		if (navigation.state !== "idle") {
			setPhase("loading");
		} else if (phase === "loading") {
			setPhase("finishing");
		}
	}, [navigation.state, phase]);

	useEffect(() => {
		if (phase !== "finishing") return;
		const timeout = window.setTimeout(() => setPhase("idle"), 220);
		return () => window.clearTimeout(timeout);
	}, [phase]);

	if (phase === "idle") return null;

	return (
		<div
			className={`top-loading-indicator top-loading-indicator--${phase}`}
			role="status"
			aria-label="Loading"
			aria-live="polite"
		/>
	);
}
