import { Connection, type Keypair } from "@solana/web3.js";
import { Context, Effect, Layer } from "effect";
import type { ConfigError, SignerError } from "../errors.js";
import { AppConfig } from "./Config.js";

export interface SolanaService {
	readonly connection: Effect.Effect<Connection>;
	/** @deprecated Use keypairFor(wallet) — returns first enabled wallet's keypair */
	readonly signer: Effect.Effect<Keypair, SignerError>;
	readonly keypairFor: (
		wallet: string,
	) => Effect.Effect<Keypair, SignerError | ConfigError>;
	readonly keypairs: Effect.Effect<
		Map<string, Keypair>,
		SignerError | ConfigError
	>;
}

export class Solana extends Context.Tag("Solana")<Solana, SolanaService>() {}

const make = Effect.gen(function* () {
	const config = yield* AppConfig;
	let cached: { rpcUrl: string; connection: Connection } | null = null;

	const service: SolanaService = {
		connection: config.rpcUrl.pipe(
			Effect.map((rpcUrl) => {
				if (cached && cached.rpcUrl === rpcUrl) return cached.connection;
				const connection = new Connection(rpcUrl, "confirmed");
				cached = { rpcUrl, connection };
				return connection;
			}),
		),
		signer: config.keypair,
		keypairFor: (wallet: string) => config.keypairFor(wallet),
		keypairs: config.keypairs,
	};
	return service;
});

export const SolanaLive = Layer.effect(Solana, make);
