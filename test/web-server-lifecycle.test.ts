import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Fiber } from "effect";
import { describe, expect, it } from "vitest";
import { createWebServerProgram } from "../src/web/lifecycle.js";

async function freePort(): Promise<number> {
	const server = await import("node:net").then(({ createServer }) => {
		const probe = createServer();
		return new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
			probe.once("error", reject);
			probe.listen(0, "127.0.0.1", () => resolve(probe));
		});
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		server.close();
		throw new Error("Could not determine an available port");
	}
	const port = address.port;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return port;
}

async function waitForHealth(url: string): Promise<Response> {
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) return response;
		} catch {
			// The listener may need a few milliseconds to bind.
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`Server did not become ready: ${url}`);
}

describe("web server lifecycle", () => {
	it("keeps serving after the listener has bound", async () => {
		const port = await freePort();
		const router = HttpRouter.empty.pipe(
			HttpRouter.get("/health", Effect.succeed(HttpServerResponse.text("ok"))),
		);
		const fiber = Effect.runFork(createWebServerProgram(router, port));
		const url = `http://127.0.0.1:${port}/health`;

		try {
			const first = await waitForHealth(url);
			expect(await first.text()).toBe("ok");
			await new Promise((resolve) => setTimeout(resolve, 50));
			const second = await fetch(url);
			expect(second.status).toBe(200);
			expect(await second.text()).toBe("ok");
		} finally {
			await Effect.runPromise(Fiber.interrupt(fiber));
		}
	});
});
