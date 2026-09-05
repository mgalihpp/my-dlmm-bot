// Telegram bot entry point. Run with: bun run bot

import { errorMessage } from "../errors.js";
import { startBot } from "./bot-runtime.js";

startBot().catch((e) => {
	console.error("Fatal:", errorMessage(e));
	process.exit(1);
});
