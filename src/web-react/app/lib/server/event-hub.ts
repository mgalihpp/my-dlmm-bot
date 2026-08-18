export class EventHub {
	private readonly clients =
		new Set<ReadableStreamDefaultController<Uint8Array>>();
	private timer: ReturnType<typeof setInterval> | null = null;

	add(client: ReadableStreamDefaultController<Uint8Array>): () => void {
		this.clients.add(client);
		return () => {
			this.clients.delete(client);
		};
	}

	get size(): number {
		return this.clients.size;
	}

	broadcast(data: string): void {
		const frame = new TextEncoder().encode(`data: ${data}\n\n`);
		for (const client of [...this.clients]) {
			try {
				client.enqueue(frame);
			} catch {
				this.clients.delete(client);
			}
		}
	}

	start(cadenceMs: number): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => {
			if (this.clients.size > 0) this.broadcast("ping");
		}, cadenceMs);
		this.timer.unref?.();
	}
}

export const realtimeHub = new EventHub();
