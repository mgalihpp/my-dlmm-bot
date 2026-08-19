// Telegram bot entry point. Run with: npm run bot

import { errorMessage } from "../errors.js";
import { startBot } from "./bot-runtime.js";

startBot().catch((e) => {
	console.error("Fatal:", errorMessage(e));
	process.exit(1);
});
