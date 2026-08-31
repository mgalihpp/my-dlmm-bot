import { assertPublicHost } from "~/lib/server/ssrf.server";
import { apiAuthMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/icon";

// Lightweight same-origin image proxy to bypass IPFS gateway CORP/COEP issues.
// Browser fetches /api/icon?url=<encoded> which is same-origin, so
// ERR_BLOCKED_BY_RESPONSE.NotSameOrigin never triggers.
// Upstream is fetched server-side and re-served with permissive headers.

export const middleware: Route.MiddlewareFunction[] = [apiAuthMiddleware];

export async function loader({ request }: Route.LoaderArgs): Promise<Response> {
	const url = new URL(request.url).searchParams.get("url");
	if (!url) return new Response("missing url", { status: 400 });

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return new Response("invalid url", { status: 400 });
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return new Response("invalid protocol", { status: 400 });
	}
	// SSRF guard: textual host check first, then verify DNS only resolves to
	// public addresses (covers literal IPs, rebinding, and reserved ranges)
	const host = parsed.hostname.toLowerCase();
	if (
		host === "localhost" ||
		host === "127.0.0.1" ||
		host === "::1" ||
		host.endsWith(".local") ||
		host.startsWith("10.") ||
		host.startsWith("192.168.") ||
		host.startsWith("172.16.") ||
		host.startsWith("172.17.") ||
		host.startsWith("172.18.") ||
		host.startsWith("172.19.") ||
		host.startsWith("172.20.") ||
		host.startsWith("172.21.") ||
		host.startsWith("172.22.") ||
		host.startsWith("172.23.") ||
		host.startsWith("172.24.") ||
		host.startsWith("172.25.") ||
		host.startsWith("172.26.") ||
		host.startsWith("172.27.") ||
		host.startsWith("172.28.") ||
		host.startsWith("172.29.") ||
		host.startsWith("172.30.") ||
		host.startsWith("172.31.") ||
		host.startsWith("169.254.") ||
		host.startsWith("100.64.") ||
		host.startsWith("100.65.") ||
		host.startsWith("100.66.") ||
		host.startsWith("0.")
	) {
		return new Response("blocked host", { status: 400 });
	}
	try {
		await assertPublicHost(host);
	} catch {
		return new Response("blocked host", { status: 400 });
	}
	let upstream: Response;
	try {
		upstream = await fetch(parsed.toString(), {
			headers: { accept: "image/*,*/*;q=0.8" },
			signal: AbortSignal.timeout(4000),
			redirect: "manual",
		});
	} catch {
		return new Response(null, {
			status: 204,
			headers: { "Cache-Control": "public, max-age=60" },
		});
	}
	if (
		upstream.status >= 300 &&
		upstream.status < 400 &&
		upstream.headers.get("location")
	) {
		return new Response("redirect blocked", { status: 400 });
	}
	const length = upstream.headers.get("content-length");
	if (length && Number(length) > 5 * 1024 * 1024) {
		return new Response("response too large", { status: 400 });
	}
	if (!upstream.ok || !upstream.body) {
		return new Response(null, {
			status: 204,
			headers: { "Cache-Control": "public, max-age=60" },
		});
	}

	const contentType = upstream.headers.get("content-type") ?? "image/png";
	// Only allow image-ish content types; fallback to octet-stream for safety
	const safeType = contentType.startsWith("image/")
		? contentType
		: "application/octet-stream";

	const headers = new Headers();
	headers.set("Content-Type", safeType);
	headers.set(
		"Cache-Control",
		"public, max-age=86400, stale-while-revalidate=86400",
	);
	headers.set("Cross-Origin-Resource-Policy", "cross-origin");
	const cacheControl = upstream.headers.get("cache-control");
	if (cacheControl) headers.set("X-Upstream-Cache-Control", cacheControl);

	return new Response(upstream.body, { headers });
}
