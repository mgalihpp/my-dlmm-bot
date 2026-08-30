import { useLocation, useNavigation } from "react-router";
import { AgentPageSkeleton } from "./page-skeletons/agent";
import { GenericPageSkeleton } from "./page-skeletons/generic";
import { PoolsPageSkeleton } from "./page-skeletons/pools";
import { PortfolioPageSkeleton } from "./page-skeletons/portfolio";
import { SettingsPageSkeleton } from "./page-skeletons/settings";
import { SettingsCategoryPageSkeleton } from "./page-skeletons/settings-category";

export {
	ChartCardSkeleton,
	ChartGridSkeleton,
	DonutCardSkeleton,
	StatCardSkeleton,
	TableSkeleton,
} from "./page-skeletons/shared";
export {
	AgentPageSkeleton,
	PoolsPageSkeleton,
	PortfolioPageSkeleton,
	SettingsCategoryPageSkeleton,
	SettingsPageSkeleton,
};

export function useIsNavigating(): boolean {
	const navigation = useNavigation();
	const location = useLocation();
	if (navigation.state !== "loading" || !navigation.location) return false;
	return navigation.location.pathname !== location.pathname;
}

export function PageSkeleton() {
	const navigation = useNavigation();
	switch (navigation.location?.pathname) {
		case "/pools":
			return <PoolsPageSkeleton />;
		case "/portfolio":
			return <PortfolioPageSkeleton />;
		case "/agent":
			return <AgentPageSkeleton />;
		case "/settings":
			return <SettingsPageSkeleton />;
		default:
			if (navigation.location?.pathname.startsWith("/settings/")) {
				return <SettingsCategoryPageSkeleton />;
			}
			return <GenericPageSkeleton />;
	}
}
