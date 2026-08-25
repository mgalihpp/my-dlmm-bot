import { useEffect } from "react";
import { useRevalidator } from "react-router";

export function canAutoRefresh(
	state: string,
	visibility: DocumentVisibilityState,
): boolean {
	return (
		visibility === "visible" && state !== "loading" && state !== "revalidating"
	);
}

export function useAutoRefresh(intervalMs = 10_000): void {
	const { revalidate, state } = useRevalidator();

	useEffect(() => {
		const refresh = () => {
			if (canAutoRefresh(state, document.visibilityState)) revalidate();
		};
		const timer = window.setInterval(refresh, intervalMs);
		return () => window.clearInterval(timer);
	}, [intervalMs, revalidate, state]);
}
