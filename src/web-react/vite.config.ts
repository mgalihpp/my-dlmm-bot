import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	// Allow importing the shared Effect services from the repo root (../..)
	// into the SSR server bundle.
	server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
	resolve: { tsconfigPaths: true },
	plugins: [tailwindcss(), reactRouter()],
});
