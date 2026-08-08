import type { Bot } from "grammy";
import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import { escapeMarkdown, tgBold } from "../format.js";
import { MD } from "../utils.js";
import type { RuntimeAgent } from "./engine.js";
import { formatJournal, formatStatus } from "./format.js";
import { readJournal } from "./journal.js";

export function registerAgentCommands(bot: Bot, rt: RuntimeAgent) {
	bot.command("agent", async (ctx) => {
		const [cmd, arg] = (ctx.match as string).trim().split(/\s+/);
		switch (cmd) {
			case "start": {
				rt.start();
				await ctx.reply("🤖 Agent started.", MD);
				break;
			}
			case "stop": {
				rt.stop();
				await ctx.reply("🛑 Agent stopped.", MD);
				break;
			}
			case "status": {
				const cfg = resolveAgentConfigFrom(await getConfig());
				await ctx.reply(formatStatus(rt.state, cfg), MD);
				break;
			}
			case "journal": {
				const n = Math.min(parseInt(arg || "5", 10) || 5, 20);
				await ctx.reply(formatJournal(readJournal(n), n), MD);
				break;
			}
			default: {
				const lines = [
					tgBold("🤖 AI Agent"),
					escapeMarkdown("/agent start — enable & loop"),
					escapeMarkdown("/agent stop — emergency stop"),
					escapeMarkdown("/agent status — state & caps"),
					escapeMarkdown("/agent journal [n] — last decisions"),
				];
				await ctx.reply(lines.join("\n"), MD);
			}
		}
	});
}
