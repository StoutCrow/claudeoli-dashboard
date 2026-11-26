// The live layer's connection state, as the view shows it.
export type ConnState =
	| { kind: "signed-out" }
	| { kind: "connecting" }
	| { kind: "ok"; at: number }
	| { kind: "offline"; since: number; retryIn: number }
	| { kind: "token-rejected" };
