import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useFetcher, useLoaderData, useRevalidator } from "react-router"
import { LoadErrorCard } from "~/components/dashboard-page-parts"
import { DashboardShell } from "~/components/dashboard-shell"
import { useAutoRefresh } from "~/hooks/use-auto-refresh"
import { useStoredCurrency } from "~/hooks/use-stored-currency"
import { POOLS_PARAM_CAP } from "~/lib/pools-param"
import type { PortfolioPayload } from "~/lib/server/portfolio.server"
import type { loader as openRangesLoader } from "~/routes/api.open-ranges"
import type { loader as poolIconsLoader } from "~/routes/api.pool-icons"
import { PortfolioHeader } from "./portfolio-header"
import type { RangeFilter } from "./portfolio-page"
import { PositionsTableSkeleton } from "./portfolio-table-skeletons"

const PositionsTable = lazy(() =>
  import("./positions-table-grid").then((m) => ({ default: m.PositionsTable }))
)

export function PortfolioActivePage() {
  useAutoRefresh(10_000)
  const data = useLoaderData<PortfolioPayload>()
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all")
  const { revalidate, state } = useRevalidator()
  const [currency, setCurrency] = useStoredCurrency("portfolio")

  const rangesFetcher = useFetcher<typeof openRangesLoader>()
  const iconsFetcher = useFetcher<typeof poolIconsLoader>()
  const rangesLoading = rangesFetcher.state !== "idle"

  const poolAddrsKey = useMemo(
    () => data.pools?.map((p) => p.poolAddress).join(",") ?? "",
    [data.pools]
  )
  const poolCount = data.pools?.length ?? 0
  const cappedAddrsKey = useMemo(
    () =>
      (data.pools ?? [])
        .slice(0, POOLS_PARAM_CAP)
        .map((p) => p.poolAddress)
        .join(","),
    [data.pools]
  )

  // Primitive derived guards (vercel rerender-dependencies)
  // biome-ignore lint/correctness/useExhaustiveDependencies: primitive deps only
  const hasRanges = useMemo(() => {
    if (!data.pools || data.pools.length === 0) return true
    return data.pools.every(
      (p) => (p as { positionsRange?: unknown }).positionsRange != null
    )
  }, [poolAddrsKey, poolCount])
  // biome-ignore lint/correctness/useExhaustiveDependencies: primitive deps only
  const needsIcons = useMemo(() => {
    if (!data.pools || data.pools.length === 0) return false
    return data.pools.some(
      (p) => (p as { tokenXIcon?: unknown }).tokenXIcon == null
    )
  }, [poolAddrsKey, poolCount])

  const rangesState = rangesFetcher.state
  const iconsState = iconsFetcher.state
  const hasRangesData = !!rangesFetcher.data
  const hasIconsData = !!iconsFetcher.data
  // biome-ignore lint/correctness/useExhaustiveDependencies: primitive deps only
  const cachedRangesAllCovered = useMemo(() => {
    const cached = rangesFetcher.data as
      { ok?: boolean; ranges?: Record<string, unknown> } | undefined
    if (!cached?.ok || !cached.ranges) return false
    if (!data.pools || data.pools.length === 0) return true
    return data.pools
      .slice(0, POOLS_PARAM_CAP)
      .every((p) => cached.ranges?.[p.poolAddress] !== undefined)
  }, [rangesFetcher.data, poolAddrsKey, poolCount])
  // biome-ignore lint/correctness/useExhaustiveDependencies: primitive deps only
  const cachedIconsAllCovered = useMemo(() => {
    const cached = iconsFetcher.data as
      { ok?: boolean; icons?: { poolAddress: string }[] } | undefined
    if (!cached?.ok || !Array.isArray(cached.icons)) return false
    const hitSet = new Set(cached.icons.map((x) => x.poolAddress))
    if (!data.pools || data.pools.length === 0) return true
    return data.pools
      .slice(0, POOLS_PARAM_CAP)
      .every((p) => hitSet.has(p.poolAddress))
  }, [iconsFetcher.data, poolAddrsKey, poolCount])

  // biome-ignore lint/correctness/useExhaustiveDependencies: P0 primitive deps only, parallel fetchers
  useEffect(() => {
    if (poolCount === 0) return
    if (hasRanges) return
    if (rangesState !== "idle") return
    if (hasRangesData) {
      if (cachedRangesAllCovered) return
      const cached = rangesFetcher.data as
        { ok?: boolean; ranges?: Record<string, unknown> } | undefined
      if (!cached?.ok) return
    }
    rangesFetcher.load(
      `/api/open-ranges?pools=${encodeURIComponent(cappedAddrsKey)}`
    )
  }, [
    cappedAddrsKey,
    poolCount,
    hasRanges,
    rangesState,
    hasRangesData,
    cachedRangesAllCovered,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: P0 primitive deps only, parallel fetchers
  useEffect(() => {
    if (poolCount === 0) return
    if (!needsIcons) return
    if (iconsState !== "idle") return
    if (hasIconsData) {
      if (cachedIconsAllCovered) return
      const cached = iconsFetcher.data as
        { ok?: boolean; icons?: { poolAddress: string }[] } | undefined
      if (!cached?.ok) return
    }
    iconsFetcher.load(
      `/api/pool-icons?pools=${encodeURIComponent(cappedAddrsKey)}`
    )
  }, [
    cappedAddrsKey,
    poolCount,
    needsIcons,
    iconsState,
    hasIconsData,
    cachedIconsAllCovered,
  ])

  const pools = useMemo(() => {
    let result = data.pools ?? []
    const rangesData = rangesFetcher.data as
      { ok?: boolean; ranges?: Record<string, unknown> } | undefined
    if (rangesData?.ok && rangesData.ranges) {
      result = result.map((p) => {
        const r = (rangesData.ranges as Record<string, unknown>)[p.poolAddress]
        if (!r) return p
        return { ...p, positionsRange: r } as typeof p
      })
    }
    const iconsData = iconsFetcher.data as
      | {
          ok?: boolean
          icons?: {
            poolAddress: string
            tokenXIcon: string | null
            tokenYIcon: string | null
            mcap: number | null
          }[]
        }
      | undefined
    if (iconsData?.ok && Array.isArray(iconsData.icons)) {
      const map = new Map(iconsData.icons.map((x) => [x.poolAddress, x]))
      result = result.map((p) => {
        const hit = map.get(p.poolAddress)
        if (!hit) return p
        return {
          ...p,
          tokenXIcon: hit.tokenXIcon,
          tokenYIcon: hit.tokenYIcon,
          mcap: hit.mcap,
        } as typeof p
      })
    }
    return result
  }, [data.pools, rangesFetcher.data, iconsFetcher.data])

  if (!data.ok) {
    return (
      <DashboardShell title="Portfolio">
        <div className="px-4 py-6 lg:px-6">
          <LoadErrorCard title="Failed to load" error={data.error} />
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <PortfolioHeader
          title="Active Positions"
          currency={currency}
          onCurrencyChange={setCurrency}
          onRefresh={revalidate}
          refreshing={state === "loading"}
        />
        <Suspense fallback={<PositionsTableSkeleton />}>
          <PositionsTable
            pools={pools}
            rangeFilter={rangeFilter}
            onRangeFilterChange={setRangeFilter}
            currency={currency}
            solPrice={data.solPrice}
            rangesLoading={rangesLoading}
          />
        </Suspense>
      </div>
    </DashboardShell>
  )
}
