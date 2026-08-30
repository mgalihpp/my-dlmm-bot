import { useEffect, useRef } from "react";
import { drawPnlCard } from "../../../../pnl-card/render.js";
import type { CardStyle, PnlCardData } from "../../../../pnl-card/types.js";

export const CARD_WIDTH = 600;
export const CARD_HEIGHT = 400;

export function PnlCardCanvas({
	data,
	style,
	className,
}: {
	data: PnlCardData;
	style?: CardStyle;
	className?: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		canvas.width = CARD_WIDTH;
		canvas.height = CARD_HEIGHT;
		drawPnlCard(ctx, data, { width: CARD_WIDTH, height: CARD_HEIGHT, style });
	}, [data, style]);

	return (
		<canvas
			ref={ref}
			data-pnl-card-canvas=""
			width={CARD_WIDTH}
			height={CARD_HEIGHT}
			className={className}
			style={{
				width: "100%",
				height: "auto",
				maxWidth: CARD_WIDTH,
				aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
			}}
		/>
	);
}
