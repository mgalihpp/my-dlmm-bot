import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse, HttpClientRequest } from "@effect/platform";
import { MeteoraApi, MeteoraApiLayer } from "../src/services/MeteoraApi.js";
import { AppConfigTest } from "../src/services/Config.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
  HttpClientResponse.fromWeb(
    HttpClientRequest.get(url),
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const mockClient = (handler: (url: string) => { body: unknown; status?: number }) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((req) => {
      const { body, status } = handler(req.url);
      return Effect.succeed(jsonResponse(req.url, body, status ?? 200));
    }),
  );

const totalPnlBody = {
  totalPnlUsd: "12.5",
  totalPnlSol: "0.08",
  totalPnlPctChange: "3.2",
  totalPnlSolPctChange: "2.9",
};

const layerWith = (handler: (url: string) => { body: unknown; status?: number }) =>
  MeteoraApiLayer.pipe(
    Layer.provide(mockClient(handler)),
    Layer.provideMerge(AppConfigTest({})),
  );

describe("MeteoraApi", () => {
  it("decodes a valid totalPnl response", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* MeteoraApi;
        return yield* api.totalPnl("Wallet111");
      }).pipe(Effect.provide(layerWith(() => ({ body: totalPnlBody })))),
    );
    expect(result.totalPnlUsd).toBe("12.5");
  });

  it("fails with DecodeError on schema mismatch", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const api = yield* MeteoraApi;
        return yield* api.totalPnl("Wallet111");
      }).pipe(Effect.provide(layerWith(() => ({ body: { nope: true } })))),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("DecodeError");
    }
  });

  it("fails with MeteoraApiError including status on 404", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const api = yield* MeteoraApi;
        return yield* api.totalPnl("Wallet111");
      }).pipe(Effect.provide(layerWith(() => ({ body: { error: "not found" }, status: 404 })))),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const s = JSON.stringify(exit.cause);
      expect(s).toContain("MeteoraApiError");
      expect(s).toContain("404");
    }
  });

  it("retries transient 500 then succeeds", async () => {
    let calls = 0;
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* MeteoraApi;
        return yield* api.totalPnl("Wallet111");
      }).pipe(
        Effect.provide(
          layerWith(() => {
            calls++;
            return calls === 1 ? { body: { error: "boom" }, status: 500 } : { body: totalPnlBody };
          }),
        ),
      ),
    );
    expect(calls).toBe(2);
    expect(result.totalPnlSol).toBe("0.08");
  });

  it("sends page params for openPortfolio and decodes pools", async () => {
    let seenUrl = "";
    const body = {
      hasNext: false,
      page: 2,
      pageSize: 10,
      totalCount: 0,
      totalPositions: 0,
      solPrice: null,
      total: null,
      pools: [],
    };
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* MeteoraApi;
        return yield* api.openPortfolio("W", 2, 10);
      }).pipe(
        Effect.provide(
          layerWith((url) => {
            seenUrl = url;
            return { body };
          }),
        ),
      ),
    );
    expect(seenUrl).toContain("page=2");
    expect(seenUrl).toContain("page_size=10");
    expect(seenUrl).toContain("user=W");
    expect(result.pools).toEqual([]);
  });
});
