import path from "node:path";
import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request: _request }: LoaderFunctionArgs) => {
	const jsonData = {
		workspace: {
			root: path.resolve(),
			uuid: "a89a1814-6a17-433b-a055-365e6fb146be",
		},
	};
	return Response.json(jsonData);
};
