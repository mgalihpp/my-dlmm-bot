import { useCallback, useEffect } from "react";
import type { ViewMode } from "~/lib/view-preference";
import { getDefaultViewMode } from "~/lib/view-preference";
import { usePreferenceStore } from "~/stores/preference";

const VIEW_KEYS = {
	pools: "vexis:pools:results-view",
	open: "vexis:portfolio:open-view",
	closed: "vexis:portfolio:closed-view",
} as const;

export function useViewPreference(
	key: string,
): [ViewMode, (mode: ViewMode) => void] {
	const stored = usePreferenceStore((s) => s.viewModes[key]);
	const setViewMode = usePreferenceStore((s) => s.setViewMode);

	useEffect(() => {
		if (stored) return;
		try {
			const raw = localStorage.getItem(key);
			if (raw === "table" || raw === "card") {
				setViewMode(key, raw);
				return;
			}
		} catch {}
		try {
			setViewMode(key, getDefaultViewMode(window.innerWidth));
		} catch {}
	}, [key, stored, setViewMode]);

	useEffect(() => {
		usePreferenceStore.persist.rehydrate();
	}, []);

	const viewMode: ViewMode = stored ?? "table";

	const setMode = useCallback(
		(mode: ViewMode) => {
			setViewMode(key, mode);
			try {
				localStorage.setItem(key, mode);
			} catch {}
		},
		[key, setViewMode],
	);

	return [viewMode, setMode];
}

export { VIEW_KEYS };
