import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "vexis-theme";

export function applyTheme(theme: Theme): void {
	document.documentElement.classList.toggle("dark", theme === "dark");
}

export function storedTheme(): Theme | null {
	const saved = localStorage.getItem(KEY);
	return saved === "light" || saved === "dark" ? saved : null;
}

export function resolveTheme(saved: Theme | null, prefersDark: boolean): Theme {
	return saved ?? (prefersDark ? "dark" : "light");
}

export function useTheme(): [Theme, (t: Theme) => void] {
	const [theme, setTheme] = useState<Theme>(() => {
		if (typeof window === "undefined") return "light";
		return resolveTheme(
			storedTheme(),
			window.matchMedia("(prefers-color-scheme: dark)").matches,
		);
	});

	useEffect(() => {
		applyTheme(theme);
		localStorage.setItem(KEY, theme);
	}, [theme]);

	return [theme, setTheme];
}
