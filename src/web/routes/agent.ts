import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { AppConfig, resolveAgentConfigFrom } from "../../services/Config.js";
import { readJournalAll } from "../../telegram/agent/journal.js";
import { loadState } from "../../telegram/agent/state.js";
import { narrativeFor } from "../agent-narrative.js";
import { agentContent, renderAgentNarrativePanel } from "../pages/agent.js";
import { pageResponse, partialResponse, type ShellInfo } from "./shared.js";

export function agentRoutes(shell: ShellInfo) {
	const agentRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const rawPage = url.searchParams.get("page");
		const parsedPage = rawPage === null ? 1 : Number(rawPage);
		const page =
			Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
		return agentContent({
			action: url.searchParams.get("action"),
			page,
		});
	});

	const narrative = Effect.gen(function* () {
		const configService = yield* AppConfig;
		const current = yield* configService.get;
		const llm = resolveAgentConfigFrom(current).llm;
		const journal = readJournalAll();
		const state = loadState();
		const narrative = yield* Effect.promise(() =>
			narrativeFor(journal, state, llm),
		);
		const panel: string = renderAgentNarrativePanel(journal, narrative);
		return yield* HttpServerResponse.html(panel);
	});

	return {
		page: agentRoute.pipe(
			Effect.map((inner) =>
				pageResponse("Agent Log", "agent", inner, "/partials/agent", shell),
			),
		),
		partial: agentRoute.pipe(
			Effect.map((inner) => partialResponse(inner, "/partials/agent")),
		),
		narrative,
	};
}
