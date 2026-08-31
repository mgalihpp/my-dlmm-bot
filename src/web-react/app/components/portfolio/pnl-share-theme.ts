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
