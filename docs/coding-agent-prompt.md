# Prompt for AI coding agents

The prompts below help an AI coding agent install, configure, or troubleshoot Vexis. Review the agent's changes before allowing it to handle secrets or on-chain operations.

## Setup prompt

```text
You are setting up Vexis, a TypeScript Telegram bot and CLI for Meteora DLMM positions on Solana.

1. Check whether this folder already contains Vexis. If it does not, clone the repository into this folder.
2. Check for Bun 1.4 or newer. If it is missing, install it using the normal package manager for this operating system.
3. Read README.md, docs/ai-agent.md, docs/config-reference.md, docs/troubleshooting.md, and AGENTS.md.
4. Run bun install and bun run build. Diagnose and fix installation or build errors instead of stopping at the first error.
5. Ask one preference at a time, using English and showing the default:
   - total agent budget in SOL, default 3
   - maximum SOL per position, default 0.5
   - maximum open positions, default 4
   - take-profit percentage, default 25
   - stop-loss percentage, default -10
   - risk level, default balanced
   - LLM model and optional OpenAI-compatible base URL, default gpt-4o-mini
   - RPC endpoint, default the value in vexis.config.example.json
6. Ask for secrets one at a time: private key, Telegram bot token, Telegram chat ID, and LLM API key. Explain each secret briefly. Never print a secret after receiving it.
7. Create vexis.config.json from vexis.config.example.json. Do not commit it.
8. Apply the chosen values to the agent, risk, LLM, and pool settings. Keep unspecified values at their documented defaults.
9. Run bun run check, bun run typecheck, and bun run test. Fix failures and rerun the checks.
10. Explain how to run bun run bot, then use /agent start and /agent status in Telegram.

Do not expose secrets in logs, messages, patches, or command output. Do not send a transaction without explicit confirmation. Use a dedicated wallet with limited funds.
```

## Troubleshooting prompt

```text
My Vexis bot has a problem. Diagnose and fix it if possible.

Error output or relevant journal entries:
[paste here]

Read docs/troubleshooting.md first, then docs/ai-agent.md if the issue involves the agent. Inspect the source before changing behavior. Redact secrets. If a secret is required, ask for it and write it only to the local git-ignored config file. Do not print it.

Verify the result with:
bun run check
bun run typecheck
bun run test
```

These prompts can be adapted for a specific RPC provider or a more conservative risk profile. Do not use them with an untrusted coding agent when the working directory contains secrets.
