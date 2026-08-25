import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { VexisConfig } from "../src/domain/config.js";
import {
	AppConfig,
	AppConfigTest,
	getWalletConfigs,
	resolveKeypairFor,
} from "../src/services/Config.js";

describe("multi-wallet config", () => {
	it("migrates legacy wallet/privateKey to wallets[0]", () => {
		const kp = Keypair.generate();
		const legacy: VexisConfig = {
			wallet: kp.publicKey.toBase58(),
			privateKey: bs58.encode(kp.secretKey),
		};
		const wallets = getWalletConfigs(legacy);
		expect(wallets).toHaveLength(1);
		expect(wallets[0].wallet).toBe(kp.publicKey.toBase58());
		expect(wallets[0].label).toBe("primary");
		expect(wallets[0].enabled).toBe(true);
		// resolve should work
		const got = resolveKeypairFor(legacy, kp.publicKey.toBase58());
		expect(got.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
	});

	it("resolves wallets array with enabled defaults", () => {
		const kp1 = Keypair.generate();
		const kp2 = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp1.publicKey.toBase58(),
					privateKey: bs58.encode(kp1.secretKey),
				},
				{
					wallet: kp2.publicKey.toBase58(),
					privateKey: bs58.encode(kp2.secretKey),
					enabled: false,
					label: "second",
				},
			],
		};
		const wallets = getWalletConfigs(cfg);
		expect(wallets).toHaveLength(2);
		expect(wallets[0].enabled).toBe(true);
		expect(wallets[1].enabled).toBe(false);
		expect(wallets[1].label).toBe("second");
	});

	it("throws on duplicate wallet addresses via resolveKeypairFor", () => {
		const cfg: VexisConfig = {
			wallets: [
				{ wallet: "A", privateKey: "k1" },
				{ wallet: "A", privateKey: "k2" },
			],
		};
		expect(() => resolveKeypairFor(cfg, "A")).toThrow(/Duplicate/);
	});

	it("resolves keypair for specific wallet (base58)", () => {
		const kp = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp.publicKey.toBase58(),
					privateKey: bs58.encode(kp.secretKey),
				},
			],
		};
		const got = resolveKeypairFor(cfg, kp.publicKey.toBase58());
		expect(got.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
	});

	it("resolves keypair for specific wallet (base64)", () => {
		const kp = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp.publicKey.toBase58(),
					privateKey: Buffer.from(kp.secretKey).toString("base64"),
				},
			],
		};
		const got = resolveKeypairFor(cfg, kp.publicKey.toBase58());
		expect(got.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
	});

	it("fails wallets Effect on duplicate via AppConfig service", async () => {
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: "DupWallet",
					privateKey: bs58.encode(Keypair.generate().secretKey),
				},
				{
					wallet: "DupWallet",
					privateKey: bs58.encode(Keypair.generate().secretKey),
				},
			],
		};
		const program = Effect.flatMap(AppConfig, (c) => c.wallets);
		const result = await Effect.runPromise(
			Effect.either(program).pipe(Effect.provide(AppConfigTest(cfg))),
		);
		expect(result._tag).toBe("Left");
	});

	it("enabledWallets filters disabled", async () => {
		const kp1 = Keypair.generate();
		const kp2 = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp1.publicKey.toBase58(),
					privateKey: bs58.encode(kp1.secretKey),
					enabled: true,
				},
				{
					wallet: kp2.publicKey.toBase58(),
					privateKey: bs58.encode(kp2.secretKey),
					enabled: false,
				},
			],
		};
		const program = Effect.flatMap(AppConfig, (c) => c.enabledWallets);
		const wallets = await Effect.runPromise(
			program.pipe(Effect.provide(AppConfigTest(cfg))),
		);
		expect(wallets).toHaveLength(1);
		expect(wallets[0].wallet).toBe(kp1.publicKey.toBase58());
	});

	it("keypairFor returns correct keypair", async () => {
		const kp1 = Keypair.generate();
		const kp2 = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp1.publicKey.toBase58(),
					privateKey: bs58.encode(kp1.secretKey),
				},
				{
					wallet: kp2.publicKey.toBase58(),
					privateKey: bs58.encode(kp2.secretKey),
				},
			],
		};
		const program = Effect.flatMap(AppConfig, (c) =>
			c.keypairFor(kp2.publicKey.toBase58()),
		);
		const got = await Effect.runPromise(
			program.pipe(Effect.provide(AppConfigTest(cfg))),
		);
		expect(got.publicKey.toBase58()).toBe(kp2.publicKey.toBase58());
	});

	it("keypairs returns map of all wallets", async () => {
		const kp1 = Keypair.generate();
		const kp2 = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp1.publicKey.toBase58(),
					privateKey: bs58.encode(kp1.secretKey),
				},
				{
					wallet: kp2.publicKey.toBase58(),
					privateKey: bs58.encode(kp2.secretKey),
				},
			],
		};
		const program = Effect.flatMap(AppConfig, (c) => c.keypairs);
		const map = await Effect.runPromise(
			program.pipe(Effect.provide(AppConfigTest(cfg))),
		);
		expect(map.size).toBe(2);
		expect(map.get(kp1.publicKey.toBase58())?.publicKey.toBase58()).toBe(
			kp1.publicKey.toBase58(),
		);
	});

	it("wallet() fallback returns first enabled wallet", async () => {
		const kp1 = Keypair.generate();
		const kp2 = Keypair.generate();
		const cfg: VexisConfig = {
			wallets: [
				{
					wallet: kp1.publicKey.toBase58(),
					privateKey: bs58.encode(kp1.secretKey),
					enabled: true,
				},
				{
					wallet: kp2.publicKey.toBase58(),
					privateKey: bs58.encode(kp2.secretKey),
					enabled: true,
				},
			],
		};
		const program = Effect.flatMap(AppConfig, (c) => c.wallet());
		const addr = await Effect.runPromise(
			program.pipe(Effect.provide(AppConfigTest(cfg))),
		);
		expect(addr).toBe(kp1.publicKey.toBase58());
	});
});
