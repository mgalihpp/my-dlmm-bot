import { useEffect, useRef, useState } from "react";
import { useNavigation } from "react-router";

export function TopLoadingIndicator() {
	const navigation = useNavigation();
	const isLoading = navigation.state !== "idle";
	const [phase, setPhase] = useState<"idle" | "loading" | "finishing">("idle");
	const prevLoadingRef = useRef(false);

	useEffect(() => {
		if (isLoading && !prevLoadingRef.current) {
			prevLoadingRef.current = true;
			setPhase("loading");
			return;
		}
		if (!isLoading && prevLoadingRef.current) {
			prevLoadingRef.current = false;
			setPhase("finishing");
			const timeout = window.setTimeout(() => setPhase("idle"), 220);
			return () => window.clearTimeout(timeout);
		}
	}, [isLoading]);

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
