import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@vexis": fileURLToPath(new URL("./src", import.meta.url)),
			"~": fileURLToPath(new URL("./src/web-react/app", import.meta.url)),
		},
	},
	test: {
		include: ["test/**/*.test.ts", "src/**/*.test.ts"],
		globals: false,
	},
});
