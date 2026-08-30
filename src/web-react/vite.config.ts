import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import devtoolsJson from "vite-plugin-devtools-json";

export default defineConfig({
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
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules/recharts")) return "recharts";
					if (id.includes("node_modules/radix-ui")) return "radix";
					return undefined;
				},
			},
		},
	},
});
