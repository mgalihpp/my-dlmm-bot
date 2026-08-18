import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

export function shouldRevalidate(state: string): boolean {
	return state !== "loading" && state !== "revalidating";
}

export function useRealtimeRevalidate(cadenceMs = 10_000): void {
	const { revalidate, state } = useRevalidator();
	const stateRef = useRef(state);
	stateRef.current = state;
	const lastRef = useRef(0);

	useEffect(() => {
		const events = new EventSource("/api/live");
		events.onmessage = () => {
			const now = Date.now();
			if (now - lastRef.current < cadenceMs) return;
			lastRef.current = now;
			if (shouldRevalidate(stateRef.current)) revalidate();
		};
		return () => events.close();
	}, [revalidate, cadenceMs]);
}
