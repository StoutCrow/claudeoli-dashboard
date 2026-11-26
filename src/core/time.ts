// Ages and dates as the dashboard writes them. Pure.

/** A short age: "20 s", "3 min", "2 h", "4 d". */
export function age(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s} s`;
	if (s < 3600) return `${Math.floor(s / 60)} min`;
	if (s < 86400) return `${Math.floor(s / 3600)} h`;
	return `${Math.floor(s / 86400)} d`;
}

const two = (n: number) => String(n).padStart(2, "0");

/** The local date as YYYY-MM-DD. */
export function today(d = new Date()): string {
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The local time as HH:MM. */
export function clock(ms: number): string {
	const d = new Date(ms);
	return `${two(d.getHours())}:${two(d.getMinutes())}`;
}
