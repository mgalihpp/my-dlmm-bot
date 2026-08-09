import { Effect, Schedule, ScheduleDecision, ScheduleInterval } from "effect";

/** Milliseconds until the next wall-clock boundary of `intervalMs`.
 * Aligns periodic jobs to a fixed grid (e.g. 300s → :00/:05/:10), unlike
 * Schedule.spaced which drifts because it measures from the end of each run.
 * Returns 0 when `nowMs` is exactly on a boundary. */
export function delayToNextBoundary(intervalMs: number, nowMs: number): number {
	return (intervalMs - (nowMs % intervalMs)) % intervalMs;
}

/** Effect schedule that fires at wall-clock boundaries of `intervalMs`.
 * With `Effect.repeat`, the first run still happens immediately at startup,
 * then subsequent runs land on the grid. */
export const alignedSchedule = (intervalMs: number) =>
	Schedule.makeWithState<void, void, number>(void 0, (now) =>
		Effect.succeed([
			void 0,
			0,
			ScheduleDecision.continueWith(
				ScheduleInterval.after(now + delayToNextBoundary(intervalMs, now)),
			),
		]),
	);

/** Milliseconds until `hour` (0-23, local time) today, or tomorrow if already past. */
export function delayToDaily(hour: number, nowMs: number): number {
	const d = new Date(nowMs);
	const target = new Date(d);
	target.setHours(hour, 0, 0, 0);
	if (target.getTime() <= nowMs) target.setDate(target.getDate() + 1);
	return target.getTime() - nowMs;
}
