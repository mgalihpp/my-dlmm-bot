# Troubleshooting

Start with the console output, `vexis.config.json`, `.vexis-agent.json`, and `.vexis-agent-journal.jsonl`.

## Setup and build

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails | Node is older than 20 or the install is incomplete. | Install Node.js 20+, then run `npm install` again. |
| `npm run build` fails with TypeScript errors | Dependencies are missing or the source has a type error. | Run `npm run typecheck` and fix the first reported error. |
| `npm start` does not start the CLI | `npm start` starts the web server, not the CLI. | Build first, then use the `vexis` binary or `npm run cli -- <command>`. |
| The wrong config is loaded | Vexis found another config path first. | Check `VEXIS_CONFIG`, then `./vexis.config.json`, then `~/.vexis/config.json`. |

## Configuration and RPC

| Symptom | Likely cause | Fix |
|---|---|---|
| Invalid private key | The value is not valid base64 or base58 keypair data. | Replace it with a valid key and restart the process. |
| RPC timeout or rate limit | The endpoint is unavailable or overloaded. | Change `rpcUrl` in the config file. `RPC_URL` is not supported. |
| Transactions fail | The signer lacks SOL or the RPC rejected the transaction. | Check the balance, RPC logs, slippage, and simulation output. |
| Portfolio uses the wrong wallet | `wallet` is wrong or a command argument overrides it. | Check the config and the optional wallet argument. |
| A config edit has no effect | The process has not reloaded the file or the value is overridden by an environment variable. | Restart the process and check the environment overrides. |

## Telegram

| Symptom | Likely cause | Fix |
|---|---|---|
| `/start` gets no response | Invalid token or the bot is not running. | Check `telegramBotToken` or `TELEGRAM_BOT_TOKEN`, then run `npm run bot`. |
| Notifications do not arrive | Wrong chat ID or the bot has not been started in that chat. | Check `telegramChatId` or `TELEGRAM_CHAT_ID` and send `/start` to the bot. |
| An old button does nothing | Callback state belongs to an older process or message. | Send a new command and use the new keyboard. |
| Responses are slow | Network, RPC, or upstream API latency. | Check server connectivity and the configured RPC endpoint. |

## AI agent

| Symptom | Likely cause | Fix |
|---|---|---|
| `llmStatus: "failed"` | Wrong LLM URL, model, key, timeout, rate limit, or malformed output. | Check `agent.llm.*`, `OPENAI_API_KEY`, and the provider response. |
| Many `blocked` decisions | A deterministic cooldown, risk, duplicate, or budget rule is working. | Read `blockedReason` in the journal before changing limits. |
| The agent never opens | The LLM returned `hold`, or every `open` was blocked. | Read each decision's `rationale` and `blockedReason`. |
| `llmStatus: "skipped"` | Screening returned no candidates. | Review the `pools.*` filters. |
| `execution: "failed"` | Insufficient SOL, slippage, RPC failure, or an on-chain rejection. | Check the signer balance, `slippageBps`, RPC, and transaction error. |
| The agent stops after restart | `agent.enabled` is false or the agent was stopped. | Run `/agent start` and check `/agent status`. |
| No agent notifications | The agent is not running or the Telegram target is wrong. | Check `/agent status` and the chat ID. |
| Runtime files are large | The journal records every cycle and action. | Archive it if needed. Do not delete state while the agent is running. |

## Web dashboard

| Symptom | Likely cause | Fix |
|---|---|---|
| Password is rejected | `VEXIS_WEB_PASSWORD` or `web.password` is wrong. | Check the environment variable first, then the config. |
| Port is busy | Another process uses `web.port`. | Choose an unused port and restart. |
| Data looks stale | The page or loader has not refreshed. | Hard-refresh the browser. Portfolio and agent data normally refresh about every 10 seconds. |
| Dashboard is unavailable | The web server is not running. | Run `npm start` and check the configured port. |

## Verification

```bash
npm run check
npm run typecheck
npm test
```

If the problem remains, include the first console error, the relevant config keys with secrets removed, and the relevant journal entry when asking for help.
