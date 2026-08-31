import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CardThemeSettings = {
	backgroundId: string;
	customColor: string;
	customImage: string | null;
	textureId: string;
	opacity: number;
	zoom: number;
	overlayColor: string;
	overlayOpacity: number;
	overlayType: "solid" | "gradient";
	textMode: "light" | "dark";
	textShadow: number;
	imageZoom: number;
	positionX: number;
	positionY: number;
};

const initialTheme: CardThemeSettings = {
	backgroundId: "neutral",
	customColor: "#6366f1",
	customImage: null,
	textureId: "none",
	opacity: 60,
	zoom: 1,
	overlayColor: "#000000",
	overlayOpacity: 60,
	overlayType: "solid",
	textMode: "light",
	textShadow: 50,
	imageZoom: 1.0,
	positionX: 50,
	positionY: 50,
};

type CardThemeStore = {
	theme: CardThemeSettings;
	setThemeField: <K extends keyof CardThemeSettings>(
		key: K,
		value: CardThemeSettings[K],
	) => void;
	resetTheme: () => void;
};

export const useCardThemeStore = create<CardThemeStore>()(
	persist(
		(set) => ({
			theme: initialTheme,
			setThemeField: (key, value) =>
				set((s) => {
					const theme = { ...s.theme };
					theme[key] = value;
					return { theme };
				}),
			resetTheme: () => set({ theme: initialTheme }),
		}),
		{
			name: "vexis:card-theme",
			partialize: (s) => ({
				theme: { ...s.theme, customImage: null },
			}),
		},
	),
);
