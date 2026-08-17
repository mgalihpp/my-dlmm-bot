import { describe, expect, it } from "vitest";
import handleRequest, {
	streamTimeout,
} from "../src/web-react/app/entry.server.js";

describe("web SSR", () => {
	it("allows streamed route content to settle beyond the framework default", () => {
		expect(streamTimeout).toBeGreaterThan(5_000);
	});

	it("exports the server request handler required by React Router", () => {
		expect(handleRequest).toBeTypeOf("function");
	});
});
