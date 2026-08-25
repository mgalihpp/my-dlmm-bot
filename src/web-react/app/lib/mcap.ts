export function computeLiveMcap(
	discoveryMcap: number | null | undefined,
	discoveryPrice: number | null | undefined,
	poolPrice: number | null | undefined,
	solPrice: number | null | undefined,
): number | null {
	if (
		discoveryMcap == null ||
		!Number.isFinite(discoveryMcap) ||
		discoveryMcap <= 0 ||
		discoveryPrice == null ||
		!Number.isFinite(discoveryPrice) ||
		discoveryPrice <= 0 ||
		poolPrice == null ||
		!Number.isFinite(poolPrice) ||
		poolPrice <= 0 ||
		solPrice == null ||
		!Number.isFinite(solPrice) ||
		solPrice <= 0
	) {
		return null;
	}
	const supply = discoveryMcap / discoveryPrice;
	return Math.round(supply * poolPrice * solPrice);
}
