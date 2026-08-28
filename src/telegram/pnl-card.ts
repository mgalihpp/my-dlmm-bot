/// <reference lib="dom" />

import type { ClosedPool, PortfolioTotal } from "../domain/portfolio.js";
import {
	CARD_HEIGHT,
	CARD_WIDTH,
	createPnlCardDataFromPosition,
	createPnlCardDataFromTotal,
	drawPnlCard,
} from "../pnl-card/render.js";
import type { PnlCardData } from "../pnl-card/types.js";

export type { PnlCardData };
export function buildTotalPnlCardData(
	wallet: string,
	total: PortfolioTotal,
	closedPools: readonly ClosedPool[],
): PnlCardData {
	return createPnlCardDataFromTotal({ wallet, total, closedPools });
}

export function buildPositionPnlCardData(params: {
	wallet: string;
	pnlUsd: string | number;
	pnlSol: string | number | null | undefined;
	pnlPct: string | number | null | undefined;
	pairName: string;
	poolAddress: string;
	closedPools?: readonly ClosedPool[];
}): PnlCardData {
	return createPnlCardDataFromPosition(params);
}

async function loadCanvas() {
	// Dynamic import — @napi-rs/canvas is an optional native dep not present in web build
	try {
		const mod = await import("@napi-rs/canvas");
		return mod;
	} catch {
		try {
			// @ts-expect-error fallback optional
			const mod = await import("canvas");
			return mod;
		} catch {
			throw new Error(
				"PnL card rendering requires @napi-rs/canvas (preferred) or canvas. Install with: npm install @napi-rs/canvas",
			);
		}
	}
}

export async function renderPnlCardPng(data: PnlCardData): Promise<Buffer> {
	const mod = await loadCanvas();
	const createCanvas = (
		mod as unknown as { createCanvas: (w: number, h: number) => unknown }
	).createCanvas;
	const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT) as unknown as {
		getContext: (type: string) => CanvasRenderingContext2D;
		toBuffer: (mime: string) => Buffer;
		encode?: (mime: string) => Uint8Array;
	};
	const ctx = canvas.getContext("2d");
	drawPnlCard(ctx, data, { width: CARD_WIDTH, height: CARD_HEIGHT });
	if (typeof canvas.toBuffer === "function")
		return canvas.toBuffer("image/png");
	if (canvas.encode) return Buffer.from(canvas.encode("image/png"));
	throw new Error("Canvas toBuffer not available");
}
