import { useEffect, useRef } from "react";
import {
	CARD_HEIGHT,
	CARD_WIDTH,
	drawPnlCard,
} from "../../../../pnl-card/render.js";
import type { PnlCardData } from "../../../../pnl-card/types.js";

export function PnlCardCanvas({
	data,
	className,
}: {
	data: PnlCardData;
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
		drawPnlCard(ctx, data);
	}, [data]);
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

export { CARD_HEIGHT, CARD_WIDTH };
