import { startWebServer } from "./server.js";

startWebServer().catch((error: unknown) => {
	console.error("[web] failed to start:", error);
	process.exitCode = 1;
});
