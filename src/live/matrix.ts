// A small Matrix client-server API client over an injected Http function (requestUrl in Obsidian,
// a fake in tests and in the harness). No Obsidian imports, so it is tested with node --test.

export interface HttpRequest {
	url: string;
	method: string;
	headers?: Record<string, string>;
	body?: string;
}
export type Http = (req: HttpRequest) => Promise<{ status: number; json: unknown }>;

/** A JSON object from the server: untrusted, read field by field. */
export type Json = Record<string, unknown>;

export const asObj = (x: unknown): Json => (x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : {});
export const asStr = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export class MatrixError extends Error {
	status: number;
	errcode: string;
	constructor(status: number, errcode: string, message: string) {
		super(message);
		this.status = status;
		this.errcode = errcode;
	}
}

export interface MatrixEvent {
	type: string;
	event_id: string;
	sender: string;
	origin_server_ts: number;
	state_key?: string;
	content: Json;
}

export interface SyncResponse {
	next_batch: string;
	rooms?: {
		join?: Record<string, { state?: { events: MatrixEvent[] }; timeline?: { events: MatrixEvent[]; limited?: boolean } }>;
	};
}

export const AGENTS_ROOM_NAME = "ClaudeOli agents";

const enc = encodeURIComponent;

export class Matrix {
	private http: Http;
	private base: string;
	private token?: string;

	constructor(http: Http, homeserver: string, token?: string) {
		this.http = http;
		this.base = homeserver.replace(/\/+$/, "");
		this.token = token;
	}

	private async call(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<unknown> {
		const q = query ? "?" + new URLSearchParams(query).toString() : "";
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (this.token) headers.Authorization = `Bearer ${this.token}`;
		const r = await this.http({ url: `${this.base}/_matrix/client/v3${path}${q}`, method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
		if (r.status < 200 || r.status >= 300) {
			const j = asObj(r.json);
			throw new MatrixError(r.status, asStr(j.errcode) ?? "M_UNKNOWN", asStr(j.error) ?? `HTTP ${r.status}`);
		}
		return r.json ?? {};
	}

	private async obj(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<Json> {
		return asObj(await this.call(method, path, body, query));
	}

	async login(user: string, password: string, deviceName: string): Promise<{ token: string; userId: string; deviceId: string }> {
		const r = await this.obj("POST", "/login", {
			type: "m.login.password",
			identifier: { type: "m.id.user", user },
			password,
			initial_device_display_name: deviceName,
		});
		const token = asStr(r.access_token);
		const userId = asStr(r.user_id);
		if (!token || !userId) throw new MatrixError(200, "M_BAD_JSON", "login returned no token");
		return { token, userId, deviceId: asStr(r.device_id) ?? "" };
	}

	async logout(): Promise<void> {
		await this.call("POST", "/logout", {});
	}

	async whoami(): Promise<string> {
		return asStr((await this.obj("GET", "/account/whoami")).user_id) ?? "";
	}

	async joinedRooms(): Promise<string[]> {
		const r = (await this.obj("GET", "/joined_rooms")).joined_rooms;
		return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string") : [];
	}

	async roomName(roomId: string): Promise<string | null> {
		try {
			return asStr((await this.obj("GET", `/rooms/${enc(roomId)}/state/m.room.name/`)).name) ?? null;
		} catch (e) {
			if (e instanceof MatrixError && e.status === 404) return null;
			throw e;
		}
	}

	/** The joined room named "ClaudeOli agents", or null. */
	async findAgentsRoom(): Promise<string | null> {
		for (const id of await this.joinedRooms()) if ((await this.roomName(id)) === AGENTS_ROOM_NAME) return id;
		return null;
	}

	async sync(since: string | undefined, timeoutMs: number, filter: object): Promise<SyncResponse> {
		const q: Record<string, string> = { timeout: String(timeoutMs), filter: JSON.stringify(filter) };
		if (since) q.since = since;
		// The shape is checked event by event where it is read (core/live.ts).
		return (await this.obj("GET", "/sync", undefined, q)) as unknown as SyncResponse;
	}

	async send(roomId: string, type: string, content: object, txnId: string): Promise<string> {
		return asStr((await this.obj("PUT", `/rooms/${enc(roomId)}/send/${enc(type)}/${enc(txnId)}`, content)).event_id) ?? "";
	}

	async putState(roomId: string, type: string, stateKey: string, content: object): Promise<string> {
		return asStr((await this.obj("PUT", `/rooms/${enc(roomId)}/state/${enc(type)}/${enc(stateKey)}`, content)).event_id) ?? "";
	}

	async getState(roomId: string): Promise<MatrixEvent[]> {
		const r = await this.call("GET", `/rooms/${enc(roomId)}/state`);
		return Array.isArray(r) ? (r as MatrixEvent[]) : [];
	}

	async createRoom(body: object): Promise<string> {
		return asStr((await this.obj("POST", "/createRoom", body)).room_id) ?? "";
	}

	async invite(roomId: string, userId: string): Promise<void> {
		await this.call("POST", `/rooms/${enc(roomId)}/invite`, { user_id: userId });
	}

	async kick(roomId: string, userId: string, reason?: string): Promise<void> {
		await this.call("POST", `/rooms/${enc(roomId)}/kick`, { user_id: userId, reason });
	}
}
