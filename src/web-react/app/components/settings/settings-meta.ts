import {
	BotIcon,
	CogIcon,
	Layers3Icon,
	PlusIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import type { Section } from "~/lib/settings";

export type SettingsSectionKey = Section | "preferences";

export const SECTIONS: readonly {
	key: SettingsSectionKey;
	title: string;
	description: string;
	icon: typeof CogIcon;
	group: string;
}[] = [
	{
		key: "general",
		title: "General",
		description: "Wallet, RPC, and dashboard defaults",
		icon: CogIcon,
		group: "Connection",
	},
	{
		key: "agent",
		title: "Agent",
		description: "Risk controls and autonomous execution",
		icon: BotIcon,
		group: "Automation",
	},
	{
		key: "create",
		title: "Create",
		description: "Position strategy and liquidity presets",
		icon: PlusIcon,
		group: "Trading",
	},
	{
		key: "pools",
		title: "Pools",
		description: "Discovery filters and screening rules",
		icon: Layers3Icon,
		group: "Trading",
	},
	{
		key: "preferences",
		title: "Preferences",
		description: "Currency and appearance",
		icon: SlidersHorizontalIcon,
		group: "App",
	},
];
