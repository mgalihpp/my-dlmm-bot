import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

export function useRealtimeRevalidate(): void {
	const { revalidate, state } = useRevalidator();
	const stateRef = useRef(state);
	stateRef.current = state;

	useEffect(() => {
		const events = new EventSource("/api/live");
		events.onmessage = () => {
			if (stateRef.current !== "loading") revalidate();
		};
		return () => events.close();
	}, [revalidate]);
}
