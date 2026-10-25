import sanitizeHtml from "sanitize-html";

export type HangoutEvent = {
	name: string;
	start: string;
	end: string | null;
	location: string;
	description: string;
	allDay: boolean;
};

export function normalizeEvents(
	data: unknown,
	now = new Date(),
): HangoutEvent[] {
	if (
		!data ||
		typeof data !== "object" ||
		!("events" in data) ||
		!Array.isArray(data.events)
	) {
		throw new Error("Invalid event feed");
	}
	const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
	return data.events
		.map((raw: unknown): HangoutEvent => {
			if (!raw || typeof raw !== "object") throw new Error("Invalid event");
			const event = raw as Record<string, unknown>;
			if (
				typeof event.name !== "string" ||
				typeof event.start !== "string" ||
				!Number.isFinite(Date.parse(event.start))
			) {
				throw new Error("Invalid event name or date");
			}
			return {
				name: event.name,
				start: event.start,
				end:
					typeof event.end === "string" &&
					Number.isFinite(Date.parse(event.end))
						? event.end
						: null,
				location: typeof event.location === "string" ? event.location : "",
				allDay: /^\d{4}-\d{2}-\d{2}$/.test(event.start),
				description: sanitizeHtml(
					typeof event.description === "string" ? event.description : "",
					{
						allowedTags: ["p", "br", "strong", "em", "ul", "ol", "li", "a"],
						allowedAttributes: { a: ["href"] },
						allowedSchemes: ["https", "http", "mailto"],
						allowProtocolRelative: false,
					},
				),
			};
		})
		.filter((event) =>
			event.allDay && event.end
				? event.end.slice(0, 10) > today
				: event.end
					? Date.parse(event.end) >= now.getTime()
					: new Date(event.start).toLocaleDateString("sv-SE", {
							timeZone: "Europe/Oslo",
						}) >= today,
		)
		.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}
