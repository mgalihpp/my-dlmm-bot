import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import devtoolsJson from "vite-plugin-devtools-json";

export default defineConfig({
	// Allow importing the shared Effect services from the repo root (../..)
	// into the SSR server bundle.
	server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
	resolve: { tsconfigPaths: true },
	plugins: [
		tailwindcss(),
		reactRouter(),
		babel({
			include: /\.[jt]sx?$/,
			presets: [["@babel/preset-typescript", { allowDeclareFields: true }]],
			plugins: ["babel-plugin-react-compiler"],
		} as Parameters<typeof babel>[0]),
		devtoolsJson(),
	],
});
