#!/usr/bin/env node
/**
 * CLI entry point for the refactored coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import * as undici from "undici";
import { APP_NAME } from "./config.js";
import { main } from "./main.js";

process.title = APP_NAME;
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// bodyTimeout/headersTimeout default to 300s in undici; long local-LLM stalls
// (e.g. vLLM buffering a large tool call) exceed that and abort the SSE stream
// with UND_ERR_BODY_TIMEOUT. Disable both — provider SDKs enforce their own
// AbortController-based deadlines via retry.provider.timeoutMs.
undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent({ bodyTimeout: 0, headersTimeout: 0 }));

// Keep fetch and the dispatcher on the same undici implementation. Node 26.0's
// bundled fetch can otherwise consume compressed responses through npm undici's
// dispatcher without decompressing them, causing response.json() failures.
// Bun 1.2.x does not expose undici.install() on its compatibility layer, so
// install the same globals manually there.
if (typeof undici.install === "function") {
	undici.install();
} else {
	Object.assign(globalThis, {
		fetch: undici.fetch,
		Headers: undici.Headers,
		Response: undici.Response,
		Request: undici.Request,
		FormData: undici.FormData,
		WebSocket: undici.WebSocket,
		CloseEvent: undici.CloseEvent,
		ErrorEvent: undici.ErrorEvent,
		MessageEvent: undici.MessageEvent,
		EventSource: undici.EventSource,
	});
}

main(process.argv.slice(2));
