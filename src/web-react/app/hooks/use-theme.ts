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

export function useTheme(): [Theme, (t: Theme) => void] {
	const [theme, setTheme] = useState<Theme>("light");

	useEffect(() => {
		setTheme(
			storedTheme() ??
				(window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light"),
		);
	}, []);

	useEffect(() => {
		applyTheme(theme);
		localStorage.setItem(KEY, theme);
	}, [theme]);

	return [theme, setTheme];
}
