import { POOLS_PARAM_CAP } from "~/lib/pools-param"
import { fetchOpenRanges } from "~/lib/server/portfolio.server"
import { isValidSolanaAddress } from "~/lib/server/validate.server"
import { apiAuthMiddleware } from "~/middleware/auth"
import type { Route } from "./+types/api.open-ranges"

export const middleware = [apiAuthMiddleware]

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const poolsParam = url.searchParams.get("pools")
  const pools = poolsParam
    ? poolsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, POOLS_PARAM_CAP)
    : undefined
  if (pools && !pools.every(isValidSolanaAddress)) {
    return Response.json(
      { ok: false, error: "invalid pool address" },
      { status: 400 }
    )
  }
  try {
    const ranges = await fetchOpenRanges(pools)
    return Response.json({ ok: true, ranges })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
