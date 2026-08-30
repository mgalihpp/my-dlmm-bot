import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/login.tsx"),
	route("portfolio", "routes/portfolio.tsx"),
	route("portfolio/active", "routes/portfolio-active.tsx"),
	route("portfolio/closed", "routes/portfolio-closed.tsx"),
	route("pools", "routes/pools.tsx"),
	route("agent", "routes/agent.tsx"),
	route("settings", "routes/settings.tsx", [
		index("routes/settings-index.tsx"),
		route(":category", "routes/settings-category.tsx"),
	]),
	route("api/closed-detail/:pool", "routes/api/closed-detail.tsx"),
	route("api/icon", "routes/api/icon.tsx"),
	route("api/pools-enriched", "routes/api.pools-enriched.ts"),
] satisfies RouteConfig;
