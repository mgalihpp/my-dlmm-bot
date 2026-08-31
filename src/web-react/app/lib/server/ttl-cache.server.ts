export interface TtlCache<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
	load(key: K, fetcher: () => Promise<V>): Promise<V>;
}

export function createTtlCache<K, V>(options: {
	ttlMs: number;
	isFresh?: (key: K, value: V, now: number) => boolean;
}): TtlCache<K, V> {
	const { ttlMs, isFresh } = options;
	const entries = new Map<K, { value: V; at: number }>();
	const inflight = new Map<K, Promise<V>>();
	const isEntryFresh = (key: K, at: number, now: number): boolean => {
		const entry = entries.get(key);
		if (!entry) return false;
		return isFresh ? isFresh(key, entry.value, now) : now - at < ttlMs;
	};
	return {
		get(key) {
			const entry = entries.get(key);
			if (!entry) return undefined;
			return isEntryFresh(key, entry.at, Date.now()) ? entry.value : undefined;
		},
		set(key, value) {
			entries.set(key, { value, at: Date.now() });
		},
		load(key, fetcher) {
			const entry = entries.get(key);
			if (entry && isEntryFresh(key, entry.at, Date.now()))
				return Promise.resolve(entry.value);
			const existing = inflight.get(key);
			if (existing) return existing;
			const promise = fetcher().then((value) => {
				entries.set(key, { value, at: Date.now() });
				return value;
			});
			inflight.set(key, promise);
			promise.then(
				() => inflight.delete(key),
				() => inflight.delete(key),
			);
			return promise;
		},
	};
}
