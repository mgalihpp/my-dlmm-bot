export type CardTheme = {
	background: string;
	backgroundImage?: string | null;
	overlayColor?: string;
	overlayOpacity?: number;
	overlayType?: "solid" | "gradient";
	textMode?: "light" | "dark";
	textShadow?: number;
	imageZoom?: number;
	positionX?: number;
	positionY?: number;
	texture: string | null;
	opacity: number;
	zoom: number;
};

export type BackgroundEntry = { id: string; label: string; value: string };
export type TextureEntry = { id: string; label: string; css: string | null };

export const BACKGROUNDS: BackgroundEntry[] = [
	{ id: "transparent", label: "Transparent", value: "transparent" },
	{ id: "neutral", label: "Neutral", value: "#0a0a0a" },
	{ id: "emerald", label: "Emerald", value: "#064e3b" },
	{ id: "slate", label: "Slate", value: "#0f172a" },
	{ id: "zinc", label: "Zinc", value: "#18181b" },
	{ id: "amber", label: "Amber", value: "#422006" },
	{ id: "violet", label: "Violet", value: "#1e1b4b" },
	{ id: "rose", label: "Rose", value: "#3f0a2e" },
];

export const TEXTURES: TextureEntry[] = [
	{ id: "none", label: "None", css: null },
	{
		id: "grid",
		label: "Grid",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 20px), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 20px)",
	},
	{
		id: "dots",
		label: "Dots",
		css: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
	},
	{
		id: "diagonal",
		label: "Diagonal",
		css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 10px)",
	},
	{
		id: "diagonal2",
		label: "Diagonal 2",
		css: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 10px)",
	},
	{
		id: "cross",
		label: "Cross",
		css: "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 12px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 12px)",
	},
	{
		id: "lines-h",
		label: "H Lines",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 14px)",
	},
	{
		id: "lines-v",
		label: "V Lines",
		css: "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 14px)",
	},
	{
		id: "zigzag",
		label: "Zigzag",
		css: "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 12px)",
	},
	{
		id: "noise",
		label: "Noise",
		css: "radial-gradient(rgba(255,255,255,0.10) 1.5px, transparent 1.5px)",
	},
	{
		id: "small-grid",
		label: "Small Grid",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px)",
	},
	{
		id: "large-grid",
		label: "Large Grid",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 32px)",
	},
	{
		id: "circles",
		label: "Circles",
		css: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 10px)",
	},
	{
		id: "stripes",
		label: "Stripes",
		css: "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 8px, transparent 8px 16px)",
	},
	{
		id: "checker",
		label: "Checker",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px), repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 10px, transparent 10px 20px)",
	},
	{
		id: "wave",
		label: "Wave",
		css: "repeating-radial-gradient(circle at 0 0, rgba(255,255,255,0.05) 0 2px, transparent 2px 14px)",
	},
	{
		id: "hex",
		label: "Hex",
		css: "radial-gradient(rgba(255,255,255,0.06) 2px, transparent 2px)",
	},
	{
		id: "paper",
		label: "Paper",
		css: "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 6px)",
	},
];

export const BACKGROUND_BY_ID: Record<string, BackgroundEntry> =
	Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b])) as Record<
		string,
		BackgroundEntry
	>;

export const TEXTURE_BY_ID: Record<string, TextureEntry> = Object.fromEntries(
	TEXTURES.map((t) => [t.id, t]),
) as Record<string, TextureEntry>;

export type ResolvedCardTheme = {
	bgColor: string;
	bgImage: string | null;
	overlayColor: string;
	overlayOpacity: number;
	overlayType: "solid" | "gradient";
	overlayBackground: string;
	overlayBackgroundVertical: string;
	isDarkText: boolean;
	textColor: string;
	mutedColor: string;
	faintColor: string;
	labelColor: string;
	gridColor: string;
	shadowStyle: string;
	imageZoom: number;
	posX: number;
	posY: number;
};

export function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace("#", "");
	const full =
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h;
	const num = Number.parseInt(full, 16);
	if (Number.isNaN(num)) return `rgba(0,0,0,${alpha})`;
	const r = (num >> 16) & 255;
	const g = (num >> 8) & 255;
	const b = num & 255;
	return `rgba(${r},${g},${b},${alpha})`;
}

// Byte-compatible variant of hexToRgba kept for the cumulative card's gradient
// (spaced channels, no NaN fallback) so its rendered output stays identical.
function hexToRgbaSpaced(hex: string, alpha: number): string {
	const h = hex.replace("#", "");
	const full =
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h;
	const num = Number.parseInt(full, 16);
	const r = (num >> 16) & 255;
	const g = (num >> 8) & 255;
	const b = num & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveCardTheme(theme: CardTheme): ResolvedCardTheme {
	const bgColor =
		theme.background === "transparent" ? "#0a0a0a" : theme.background;
	const bgImage = theme.backgroundImage ?? null;
	const overlayColor = theme.overlayColor ?? "#000000";
	const overlayOpacity = theme.overlayOpacity ?? 60;
	const overlayType = theme.overlayType ?? "solid";
	const textMode = theme.textMode ?? "light";
	const textShadow = theme.textShadow ?? 50;
	const isDarkText = textMode === "dark";
	const alpha = overlayOpacity / 100;
	return {
		bgColor,
		bgImage,
		overlayColor,
		overlayOpacity,
		overlayType,
		overlayBackground:
			overlayType === "gradient"
				? `linear-gradient(180deg, ${hexToRgba(overlayColor, alpha)} 0%, ${hexToRgba(overlayColor, alpha * 0.55)} 45%, ${hexToRgba(overlayColor, 0)} 100%)`
				: hexToRgba(overlayColor, alpha),
		overlayBackgroundVertical:
			overlayType === "gradient"
				? `linear-gradient(to bottom, ${hexToRgbaSpaced(overlayColor, alpha)}, transparent)`
				: hexToRgbaSpaced(overlayColor, alpha),
		isDarkText,
		textColor: isDarkText ? "#111111" : "#ffffff",
		mutedColor: isDarkText ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)",
		faintColor: isDarkText ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.45)",
		labelColor: isDarkText ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.62)",
		gridColor: isDarkText ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.10)",
		shadowStyle:
			textShadow > 0
				? `0 1px ${Math.round((textShadow / 100) * 8 + 2)}px rgba(0,0,0,${(textShadow / 100) * 0.65})`
				: "none",
		imageZoom: theme.imageZoom ?? 1,
		posX: theme.positionX ?? 50,
		posY: theme.positionY ?? 50,
	};
}
