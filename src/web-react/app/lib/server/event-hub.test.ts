import { describe, expect, it, vi } from "vitest";
import { EventHub } from "./event-hub";

type MockController = ReadableStreamDefaultController<Uint8Array> & {
	enqueue: ReturnType<typeof vi.fn>;
};

function fakeController(): MockController {
	return {
		enqueue: vi.fn(),
	} as unknown as MockController;
}

describe("EventHub", () => {
	it("registers and unregisters clients", () => {
		const hub = new EventHub();
		const cleanup = hub.add(fakeController());
		expect(hub.size).toBe(1);
		cleanup();
		expect(hub.size).toBe(0);
	});

	it("broadcasts a data frame to all clients", () => {
		const hub = new EventHub();
		const a = fakeController();
		const b = fakeController();
		hub.add(a);
		hub.add(b);
		hub.broadcast("ping");
		expect(a.enqueue).toHaveBeenCalledWith(
			new TextEncoder().encode("data: ping\n\n"),
		);
		expect(b.enqueue).toHaveBeenCalledWith(
			new TextEncoder().encode("data: ping\n\n"),
		);
	});

	it("evicts a dead client whose enqueue throws", () => {
		const hub = new EventHub();
		const dead = fakeController();
		dead.enqueue.mockImplementation(() => {
			throw new Error("closed");
		});
		hub.add(dead);
		hub.add(fakeController());
		hub.broadcast("ping");
		expect(hub.size).toBe(1);
	});

	it("heartbeat broadcasts only while clients are connected", () => {
		vi.useFakeTimers();
		try {
			const hub = new EventHub();
			hub.start(10_000);
			const client = fakeController();
			const cleanup = hub.add(client);
			vi.advanceTimersByTime(20_000);
			expect(client.enqueue).toHaveBeenCalledTimes(2);
			cleanup();
			client.enqueue.mockClear();
			vi.advanceTimersByTime(20_000);
			expect(client.enqueue).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
