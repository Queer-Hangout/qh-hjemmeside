import { createHash } from "node:crypto";
import ical, { type VEvent, type DateWithTimeZone } from "node-ical";
import { normalizeEvents, type HangoutEvent } from "./events";

export const CALENDAR_TIMEZONE = "Europe/Oslo";
const MAX_FEED_BYTES = 2_000_000;
const MAX_OCCURRENCES = 1000;

export type CalendarOccurrence = HangoutEvent & {
	id: string;
	seriesId: string;
};
export type CalendarSeries = {
	id: string;
	fingerprint: string;
	next: CalendarOccurrence | null;
};
export type CalendarSnapshot = {
	events: CalendarOccurrence[];
	series: CalendarSeries[];
};

export function fingerprint(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function calendarDay(date: Date, timeZone = CALENDAR_TIMEZONE): string {
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

function text(value: unknown): string {
	if (typeof value === "string") return value;
	if (
		value &&
		typeof value === "object" &&
		"val" in value &&
		typeof value.val === "string"
	)
		return value.val;
	return "";
}

function dateValue(
	date: DateWithTimeZone | undefined,
	allDay = false,
): string | null {
	if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
	return allDay || date.dateOnly ? dateOnly(date) : date.toISOString();
}

function definition(event: VEvent) {
	return {
		start: dateValue(event.start, event.datetype === "date"),
		end: dateValue(event.end, event.datetype === "date"),
		name: text(event.summary),
		location: text(event.location),
		description: text(event.description),
		status: event.status ?? "CONFIRMED",
		visibility: event.class ?? "PUBLIC",
		rule: event.rrule?.toString() ?? "",
		recurrence: dateValue(event.recurrenceid, event.datetype === "date"),
		excluded: [
			...new Set(
				Object.values(event.exdate ?? {}).map((date) =>
					dateValue(date, event.datetype === "date"),
				),
			),
		].sort(),
	};
}

function publicEvent(event: VEvent): boolean {
	return event.class !== "PRIVATE" && event.class !== "CONFIDENTIAL";
}

function dateOnly(date: DateWithTimeZone): string {
	return calendarDay(
		date,
		date.tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
	);
}

export async function parseCalendar(
	source: string,
	now = new Date(),
): Promise<CalendarSnapshot> {
	const trimmed = source.trim();
	if (
		Buffer.byteLength(source) > MAX_FEED_BYTES ||
		!trimmed.startsWith("BEGIN:VCALENDAR") ||
		!trimmed.endsWith("END:VCALENDAR")
	) {
		throw new Error("Invalid or oversized calendar feed");
	}
	const parsed = await ical.async.parseICS(trimmed);
	if (
		parsed.vcalendar?.version !== "2.0" ||
		(source.match(/^BEGIN:VEVENT\r?$/gm)?.length ?? 0) !==
			(source.match(/^END:VEVENT\r?$/gm)?.length ?? 0)
	) {
		throw new Error("Incomplete calendar feed");
	}
	const events: CalendarOccurrence[] = [];
	const series: CalendarSeries[] = [];
	const from = new Date(now.getTime() - 86_400_000);
	const to = new Date(now.getTime() + 180 * 86_400_000);
	for (const component of Object.values(parsed)) {
		if (component?.type !== "VEVENT" || !publicEvent(component)) continue;
		const event = component;
		if (!event.uid) throw new Error("Calendar event is missing a UID");
		const seriesId = fingerprint(event.uid);
		const overrides = [...new Set(Object.values(event.recurrences ?? {}))];
		const signature = fingerprint([
			definition(event),
			overrides
				.map((override) => definition({ ...event, ...override }))
				.sort((left, right) =>
					String(left.recurrence).localeCompare(String(right.recurrence)),
				),
		]);
		if (event.status !== "CANCELLED") {
			if (!dateValue(event.start))
				throw new Error("Calendar event is missing a valid start");
			if (
				event.rrule &&
				/FREQ=(SECONDLY|MINUTELY|HOURLY)/.test(event.rrule.toString())
			) {
				throw new Error("Calendar recurrence is too frequent");
			}
			const dailySlots = ["byhour", "byminute", "bysecond"].reduce(
				(count, key) => {
					const values = event.rrule?.options[key];
					return (
						count * (Array.isArray(values) ? Math.max(values.length, 1) : 1)
					);
				},
				1,
			);
			if (dailySlots > 48)
				throw new Error("Calendar recurrence has too many daily times");
			for (const instance of ical.expandRecurringEvent(event, {
				from,
				to,
				expandOngoing: true,
			})) {
				if (
					instance.event.status === "CANCELLED" ||
					!publicEvent(instance.event)
				)
					continue;
				const occurrence = {
					name: text(instance.summary),
					start: instance.isFullDay
						? dateOnly(instance.start)
						: instance.start.toISOString(),
					end: instance.isFullDay
						? dateOnly(instance.end)
						: instance.end.toISOString(),
					location: text(instance.event.location ?? event.location),
					description: text(instance.event.description ?? event.description),
				};
				const normalized = normalizeEvents({ events: [occurrence] }, now)[0];
				if (!normalized) continue;
				const originalStart = instance.event.recurrenceid ?? instance.start;
				const occurrenceKey =
					instance.isRecurring || instance.isOverride
						? instance.isFullDay
							? dateOnly(originalStart)
							: originalStart.toISOString()
						: "single";
				const id = fingerprint([event.uid, occurrenceKey]);
				events.push({ ...normalized, id, seriesId });
				if (events.length > MAX_OCCURRENCES)
					throw new Error("Calendar has too many upcoming occurrences");
			}
		}
		series.push({ id: seriesId, fingerprint: signature, next: null });
	}
	events.sort(
		(left, right) =>
			left.start.localeCompare(right.start) || left.id.localeCompare(right.id),
	);
	for (const item of series)
		item.next = events.find((event) => event.seriesId === item.id) ?? null;
	series.sort((left, right) => left.id.localeCompare(right.id));
	return { events, series };
}

export async function fetchCalendarSource(
	source: string,
	fetcher: typeof fetch = fetch,
): Promise<string> {
	const url = new URL(source);
	if (url.protocol === "webcal:") url.protocol = "https:";
	if (url.protocol !== "https:" || url.username || url.password)
		throw new Error("Calendar source must use HTTPS");
	const response = await fetcher(url, {
		headers: { Accept: "text/calendar" },
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok || !response.body)
		throw new Error("Calendar download failed");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let content = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_FEED_BYTES) throw new Error("Calendar feed is too large");
			content += decoder.decode(value, { stream: true });
		}
		return content + decoder.decode();
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
}
