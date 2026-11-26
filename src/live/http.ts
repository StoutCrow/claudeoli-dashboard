import { requestUrl } from "obsidian";
import type { Http } from "./matrix.ts";

/**
 * Obsidian's requestUrl: no browser cross-origin or private-network blocks, and it works on mobile.
 * It can't be aborted, so callers drop late answers instead (see SyncLoop's generation).
 */
export const httpObsidian: Http = async (req) => {
	const r = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false });
	let json: unknown = null;
	try {
		json = r.json;
	} catch {
		json = null;
	}
	return { status: r.status, json };
};
