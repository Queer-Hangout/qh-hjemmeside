import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvents } from "../src/lib/events";

const now = new Date("2026-10-25T10:00:00Z");

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
