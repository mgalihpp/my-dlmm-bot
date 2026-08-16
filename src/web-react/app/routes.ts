import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/login.tsx"),
	route("portfolio", "routes/portfolio.tsx"),
	route("pools", "routes/pools.tsx"),
	route("agent", "routes/agent.tsx"),
] satisfies RouteConfig;
