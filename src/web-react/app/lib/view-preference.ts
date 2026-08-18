export type ViewMode = "table" | "card";

export function readViewPreference(
	storage: Storage,
	key: string,
	fallback: ViewMode,
): ViewMode {
	const value = storage.getItem(key);
	return value === "table" || value === "card" ? value : fallback;
}

export function writeViewPreference(
	storage: Storage,
	key: string,
	mode: ViewMode,
): void {
	storage.setItem(key, mode);
}

export function getDefaultViewMode(width: number, breakpoint = 768): ViewMode {
	return width < breakpoint ? "card" : "table";
}
