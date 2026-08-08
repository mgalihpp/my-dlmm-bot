import { Connection, type Keypair } from "@solana/web3.js";
import { Context, Effect, Layer } from "effect";
import type { SignerError } from "../errors.js";
import { AppConfig } from "./Config.js";

export interface SolanaService {
	readonly connection: Effect.Effect<Connection>;
	readonly signer: Effect.Effect<Keypair, SignerError>;
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
	};
	return service;
});

export const SolanaLive = Layer.effect(Solana, make);
