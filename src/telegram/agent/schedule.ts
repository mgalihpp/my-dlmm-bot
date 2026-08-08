/** Milliseconds until the next wall-clock boundary of `intervalMs`.
 * Aligns periodic jobs to a fixed grid (e.g. 300s → :00/:05/:10), unlike
 * Schedule.spaced which drifts because it measures from the end of each run.
 * Returns 0 when `nowMs` is exactly on a boundary. */
export function delayToNextBoundary(intervalMs: number, nowMs: number): number {
	return (intervalMs - (nowMs % intervalMs)) % intervalMs;
}
