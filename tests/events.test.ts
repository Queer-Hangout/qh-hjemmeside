import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvents } from "../src/lib/events";
import { parseCalendar, fetchCalendarSource } from "../src/lib/calendar";
import { GET } from "../src/app/api/events/route";

const now = new Date("2026-10-25T10:00:00Z");

function calendar(...entries: string[]) {
	return ["BEGIN:VCALENDAR", "VERSION:2.0", ...entries, "END:VCALENDAR"].join(
		"\r\n",
	);
}

const recurring = [
	"BEGIN:VEVENT",
	"UID:monthly",
	"SUMMARY:Meetup",
	"DTSTART;TZID=Europe/Oslo:20260927T140000",
	"DTEND;TZID=Europe/Oslo:20260927T160000",
	"RRULE:FREQ=MONTHLY;BYDAY=-1SU;COUNT=5",
	"EXDATE;TZID=Europe/Oslo:20261227T140000",
	"END:VEVENT",
].join("\r\n");

test("ICS recurrence respects Oslo DST, December exclusions, and moved instances", async () => {
	const override = [
		"BEGIN:VEVENT",
		"UID:monthly",
		"RECURRENCE-ID;TZID=Europe/Oslo:20261129T140000",
		"SUMMARY:Moved meetup",
		"DTSTART;TZID=Europe/Oslo:20261128T150000",
		"DTEND;TZID=Europe/Oslo:20261128T170000",
		"END:VEVENT",
	].join("\r\n");
	const parsed = await parseCalendar(
		calendar(recurring, override),
		new Date("2026-09-01T00:00:00Z"),
	);
	assert.deepEqual(
		parsed.events.map((event) => event.start),
		[
			"2026-09-27T12:00:00.000Z",
			"2026-10-25T13:00:00.000Z",
			"2026-11-28T14:00:00.000Z",
			"2027-01-31T13:00:00.000Z",
		],
	);
	const original = await parseCalendar(
		calendar(recurring),
		new Date("2026-09-01T00:00:00Z"),
	);
	assert.equal(parsed.events[2].id, original.events[2].id);
	assert.equal(parsed.events[2].name, "Moved meetup");
	for (const field of ["FREQ=MONTHLY", "BYDAY=-1SU", "COUNT=5"]) {
		assert.ok(parsed.events[2].recurrenceRule?.includes(field));
	}
	assert.equal(
		parsed.events[2].recurrenceRule,
		original.events[2].recurrenceRule,
	);
	assert.equal(parsed.events[2].status, "CONFIRMED");
	const oneOff =
		"BEGIN:VEVENT\r\nUID:one-off\r\nSUMMARY:Meetup\r\nDTSTART:20261025T130000Z\r\nDTEND:20261025T150000Z\r\nEND:VEVENT";
	const beforeMove = await parseCalendar(calendar(oneOff), now);
	const afterMove = await parseCalendar(
		calendar(oneOff.replaceAll("20261025", "20261026")),
		now,
	);
	assert.equal(beforeMove.events[0].id, afterMove.events[0].id);
	assert.equal(beforeMove.events[0].recurrenceRule, "");
});

test("ICS excludes cancelled occurrences, cancelled series, and private events", async () => {
	const override = [
		"BEGIN:VEVENT",
		"UID:monthly",
		"RECURRENCE-ID;TZID=Europe/Oslo:20261129T140000",
		"DTSTART;TZID=Europe/Oslo:20261129T140000",
		"STATUS:CANCELLED",
		"END:VEVENT",
	].join("\r\n");
	const parsed = await parseCalendar(calendar(recurring, override), now);
	assert.equal(
		parsed.events.some((event) => event.start.startsWith("2026-11-29")),
		false,
	);
	const cancelled = recurring.replace(
		"SUMMARY:Meetup",
		"SUMMARY:Meetup\r\nSTATUS:CANCELLED",
	);
	assert.equal(
		(await parseCalendar(calendar(cancelled), now)).events.length,
		0,
	);
	assert.equal(
		(
			await parseCalendar(
				calendar(
					recurring.replace(
						"SUMMARY:Meetup",
						"CLASS:PRIVATE\r\nSUMMARY:Private",
					),
				),
				now,
			)
		).series.length,
		0,
	);
});

test("all-day events retain dates and use an exclusive end in Oslo time", async () => {
	const entry =
		"BEGIN:VEVENT\r\nUID:day\r\nSUMMARY:All day\r\nDTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026\r\nEND:VEVENT";
	const parsed = await parseCalendar(calendar(entry), now);
	assert.equal(parsed.events[0].start, "2026-10-25");
	assert.equal(parsed.events[0].allDay, true);
	assert.equal(
		(await parseCalendar(calendar(entry), new Date("2026-10-25T23:05:00Z")))
			.events.length,
		0,
	);
});

test("invalid downloads cannot masquerade as an empty calendar", async () => {
	await assert.rejects(parseCalendar("<html>Sign in</html>"));
	await assert.rejects(parseCalendar("BEGIN:VCALENDAR\r\nBEGIN:VEVENT"));
	await assert.rejects(
		parseCalendar(
			"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:broken\r\nEND:VCALENDAR",
		),
	);
	assert.deepEqual((await parseCalendar(calendar(), now)).events, []);
	await assert.rejects(
		fetchCalendarSource(
			"https://example.test/feed",
			async () => new Response("failed", { status: 500 }),
		),
	);
	await assert.rejects(fetchCalendarSource("http://example.test/feed"));
	await assert.rejects(
		fetchCalendarSource(
			"https://example.test/feed",
			async () => new Response("x".repeat(2_000_001)),
		),
	);
});

test("events API consumes ICS and never exposes the source URL on success or failure", async (context) => {
	const originalFetch = globalThis.fetch;
	const originalSource = process.env.CALENDAR_ICS_URL;
	context.after(() => {
		globalThis.fetch = originalFetch;
		if (originalSource === undefined) delete process.env.CALENDAR_ICS_URL;
		else process.env.CALENDAR_ICS_URL = originalSource;
	});
	process.env.CALENDAR_ICS_URL =
		"https://calendar.example.test/feed?token=not-public";
	const start = new Date(Date.now() + 2 * 86_400_000)
		.toISOString()
		.replace(/[-:]|\.\d{3}/g, "");
	const end = new Date(Date.now() + 2 * 86_400_000 + 7_200_000)
		.toISOString()
		.replace(/[-:]|\.\d{3}/g, "");
	globalThis.fetch = async (_url, options) => {
		assert.equal(options?.next?.revalidate, 300);
		return new Response(
			calendar(
				`BEGIN:VEVENT\r\nUID:api-test\r\nSUMMARY:Direct calendar\r\nDTSTART:${start}\r\nDTEND:${end}\r\nEND:VEVENT`,
			),
		);
	};
	const response = await GET();
	assert.equal(response.status, 200);
	const data = await response.json();
	assert.equal(data.events[0].name, "Direct calendar");
	assert.ok(!JSON.stringify(data).includes("not-public"));
	globalThis.fetch = async () => new Response("<html>Upstream error</html>");
	const failure = await GET();
	assert.equal(failure.status, 503);
	assert.deepEqual(await failure.json(), { error: "events_unavailable" });
});

test("event feed keeps ongoing and future events, sorts them, and excludes expired events", () => {
	const events = normalizeEvents(
		{
			events: [
				{ name: "Future", start: "2026-11-01T12:00:00+01:00" },
				{ name: "Expired", start: "2026-10-24T12:00:00+02:00" },
				{
					name: "Ongoing",
					start: "2026-10-25T09:00:00Z",
					end: "2026-10-25T12:00:00Z",
				},
			],
		},
		now,
	);
	assert.deepEqual(
		events.map((event) => event.name),
		["Ongoing", "Future"],
	);
});

test("event HTML is sanitized and malformed feeds are not mistaken for empty calendars", () => {
	const [event] = normalizeEvents(
		{
			events: [
				{
					name: "Safe event",
					start: "2026-11-01",
					description:
						'<script>alert(1)</script><p onclick="alert(1)">Hello <a href="javascript:alert(1)">world</a></p>',
				},
			],
		},
		now,
	);
	assert.equal(event.allDay, true);
	assert.equal(event.description, "<p>Hello <a>world</a></p>");
	assert.throws(() => normalizeEvents({ error: "unavailable" }, now));
	assert.throws(() =>
		normalizeEvents(
			{ events: [{ name: "Invalid date", start: "bad date" }] },
			now,
		),
	);
	assert.deepEqual(normalizeEvents({ events: [] }, now), []);
});
