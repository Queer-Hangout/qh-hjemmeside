import assert from "node:assert/strict";
import test from "node:test";
import {
	fingerprint,
	parseCalendar,
	type CalendarOccurrence,
	type CalendarSnapshot,
} from "../src/lib/calendar";
import {
	deliverNotifications,
	discordPayload,
	parseNotificationState,
	planNotifications,
	postDiscord,
	type NotificationState,
} from "../src/lib/calendar-notifications";

const now = new Date("2026-10-24T08:00:00Z");
const sourceId = fingerprint("synthetic-source");
function event(
	name = "Meetup",
	start = "2026-10-25T13:00:00Z",
): CalendarOccurrence {
	return {
		id: fingerprint(name),
		seriesId: fingerprint(name),
		name,
		start,
		end: new Date(Date.parse(start) + 7_200_000).toISOString(),
		location: "Drammen",
		description: "Hello",
		allDay: false,
	};
}
function snapshot(...events: CalendarOccurrence[]): CalendarSnapshot {
	return {
		events,
		series: events.map((item) => ({
			id: item.seriesId,
			fingerprint: fingerprint([item.name, item.location, item.start]),
			next: item,
		})),
	};
}
function baseline(current: CalendarSnapshot): NotificationState {
	return planNotifications(
		current,
		null,
		sourceId,
		new Date("2026-10-23T08:00:00Z"),
	).state;
}

test("first run is quiet and source changes or corrupt state do not reset silently", () => {
	const current = snapshot(event());
	const plan = planNotifications(current, null, sourceId, now);
	assert.equal(plan.initialized, true);
	assert.deepEqual(plan.notifications, []);
	assert.deepEqual(parseNotificationState(plan.state), plan.state);
	assert.throws(() => parseNotificationState({ version: 1 }));
	assert.throws(() =>
		planNotifications(current, plan.state, "different-source", now),
	);
});

test("legacy state gains notification metadata without false announcements", async () => {
	const checkedAt = new Date("2026-10-23T08:00:00Z");
	const source = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"BEGIN:VEVENT",
		"UID:monthly",
		"SUMMARY:Meetup",
		"DTSTART;TZID=Europe/Oslo:20260927T140000",
		"DTEND;TZID=Europe/Oslo:20260927T160000",
		"RRULE:FREQ=MONTHLY;BYDAY=-1SU",
		"END:VEVENT",
		"END:VCALENDAR",
	].join("\r\n");
	const current = await parseCalendar(source, checkedAt);
	const legacy = structuredClone(baseline(current));
	for (const series of legacy.series) {
		if (series.next) {
			delete series.next.recurrenceRule;
			delete series.next.status;
		}
	}
	const previous = parseNotificationState(legacy);
	const saved = await deliverNotifications(
		current,
		previous,
		sourceId,
		checkedAt,
		async () => assert.fail("Metadata migration must not send a message"),
		async () => {},
	);
	assert.equal(
		saved.series[0].next?.recurrenceRule,
		current.events[0].recurrenceRule,
	);
	assert.deepEqual(parseNotificationState(saved), saved);
	for (const field of ["recurrenceRule", "status"]) {
		const invalid = structuredClone(saved);
		Object.assign(invalid.series[0].next!, { [field]: 123 });
		assert.throws(() => parseNotificationState(invalid));
	}
	const edited = await parseCalendar(
		source.replace("FREQ=MONTHLY", "FREQ=MONTHLY;INTERVAL=2"),
		checkedAt,
	);
	const plan = planNotifications(edited, saved, sourceId, checkedAt);
	assert.equal(plan.notifications.length, 1);
	assert.equal(plan.notifications[0].kind, "updated");
	const content = discordPayload(plan.notifications[0]).content;
	assert.ok(content.includes("Endret: gjentakelse"));
	assert.ok(
		content.includes(
			"Gjentakelse: ~~Hver måned, siste søndag~~ Annenhver måned, siste søndag",
		),
	);
});

test("changes are reported once per series, but rolling to its next date is not an edit", () => {
	const old = event();
	const previous = baseline(snapshot(old));
	const changed = snapshot(
		{ ...old, location: "New venue" },
		event("New event"),
	);
	const plan = planNotifications(
		changed,
		previous,
		sourceId,
		new Date("2026-10-23T08:00:00Z"),
	);
	assert.deepEqual(plan.notifications.map((item) => item.kind).sort(), [
		"created",
		"updated",
	]);
	const rolled = snapshot({
		...old,
		start: "2026-11-29T13:00:00Z",
		end: "2026-11-29T15:00:00Z",
	});
	rolled.series[0].fingerprint = previous.series[0].fingerprint;
	assert.deepEqual(
		planNotifications(rolled, previous, sourceId, now).notifications,
		[],
	);
	assert.equal(
		planNotifications(snapshot(), previous, sourceId, now).notifications[0]
			.kind,
		"cancelled",
	);
	assert.deepEqual(
		planNotifications(
			snapshot(),
			previous,
			sourceId,
			new Date("2026-10-26T08:00:00Z"),
		).notifications,
		[],
	);
});

test("day-before reminders use Oslo dates, start after nine, and survive retries", async () => {
	const current = snapshot(event());
	const previous = baseline(current);
	assert.deepEqual(
		planNotifications(
			current,
			previous,
			sourceId,
			new Date("2026-10-24T06:00:00Z"),
		).notifications,
		[],
	);
	assert.equal(
		planNotifications(current, previous, sourceId, now).notifications[0].kind,
		"reminder",
	);
	const sent: string[] = [];
	const state = await deliverNotifications(
		current,
		previous,
		sourceId,
		now,
		async (item) => {
			sent.push(item.id);
		},
		async () => {},
	);
	assert.equal(sent.length, 1);
	assert.deepEqual(
		planNotifications(
			current,
			state,
			sourceId,
			new Date("2026-10-24T09:00:00Z"),
		).notifications,
		[],
	);
	assert.notEqual(state.lastSuccessfulCheck, previous.lastSuccessfulCheck);
});

test("winter reminders start at nine Oslo time and moved occurrences can be reminded again", async () => {
	const original = event("Winter meetup", "2026-11-29T13:00:00Z");
	const current = snapshot(original);
	const previous = baseline(current);
	assert.deepEqual(
		planNotifications(
			current,
			previous,
			sourceId,
			new Date("2026-11-28T07:59:00Z"),
		).notifications,
		[],
	);
	const winterMorning = new Date("2026-11-28T08:00:00Z");
	assert.equal(
		planNotifications(current, previous, sourceId, winterMorning)
			.notifications[0].kind,
		"reminder",
	);
	const saved = await deliverNotifications(
		current,
		previous,
		sourceId,
		winterMorning,
		async () => {},
		async () => {},
	);
	const moved = snapshot({
		...original,
		start: "2026-11-29T14:00:00Z",
		end: "2026-11-29T16:00:00Z",
	});
	assert.deepEqual(
		planNotifications(moved, saved, sourceId, winterMorning).notifications.map(
			(item) => item.kind,
		),
		["updated", "reminder"],
	);
});

test("partial delivery checkpoints successes and resumes without replaying them", async () => {
	const current = snapshot(event("First"), event("Second"));
	let stored = baseline(snapshot());
	let calls = 0;
	await assert.rejects(
		deliverNotifications(
			current,
			stored,
			sourceId,
			new Date("2026-10-23T08:00:00Z"),
			async () => {
				if (++calls === 2) throw new Error("Discord unavailable");
			},
			async (state) => {
				stored = state;
			},
		),
	);
	assert.equal(stored.sentChanges.length, 1);
	assert.equal(stored.series.length, 1);
	assert.equal(
		planNotifications(
			snapshot(event("Second")),
			stored,
			sourceId,
			new Date("2026-10-23T08:00:00Z"),
		).notifications.some((item) => item.kind === "cancelled"),
		true,
	);
	const remaining = planNotifications(
		current,
		stored,
		sourceId,
		new Date("2026-10-23T08:00:00Z"),
	);
	assert.equal(remaining.notifications.length, 1);
	const completed = await deliverNotifications(
		current,
		stored,
		sourceId,
		new Date("2026-10-23T08:00:00Z"),
		async () => {},
		async () => {},
	);
	assert.deepEqual(completed.sentChanges, []);
	assert.equal(completed.series.length, 2);
});

function recurrenceRule(rule: string) {
	return `DTSTART;TZID=Europe/Oslo:20260927T140000\nRRULE:${rule}`;
}

test("Discord messages describe recurring rules in Norwegian for every notification kind", () => {
	for (const kind of ["created", "updated", "cancelled", "reminder"] as const) {
		const payload = discordPayload({
			id: "test",
			kind,
			event: {
				...event(),
				recurrenceRule: recurrenceRule("FREQ=MONTHLY;BYDAY=-1SU;COUNT=5"),
			},
		});
		assert.ok(payload.content.includes("Hver måned, siste søndag, 5 ganger"));
		assert.ok(payload.content.includes("Gjentakelse:"));
		if (kind === "cancelled")
			assert.ok(payload.content.includes("Gjentakelse: ~~Hver måned"));
	}
	for (const [rule, expected] of [
		["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "Annenhver uke, mandag og onsdag"],
		[
			"FREQ=YEARLY;INTERVAL=2;BYMONTH=1,6;BYMONTHDAY=1",
			"Annenhvert år, første dag i måneden, i januar og juni",
		],
		[
			"FREQ=MONTHLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
			"siste forekomst",
		],
		["FREQ=DAILY;UNTIL=20261231T220000Z", "til og med 31.12.2026"],
	]) {
		assert.ok(
			discordPayload({
				id: "test",
				kind: "created",
				event: {
					...event(),
					recurrenceRule: recurrenceRule(rule),
				},
			}).content.includes(expected),
		);
	}
	assert.ok(
		!discordPayload({
			id: "test",
			kind: "created",
			event: event(),
		}).content.includes("Gjentakelse:"),
	);
	assert.ok(
		discordPayload({
			id: "test",
			kind: "created",
			event: {
				...event(),
				recurrenceRule: "unsupported rule @everyone",
			},
		}).content.includes("unsupported rule @\u200beveryone"),
	);
});

test("edits list changed fields and strike through their previous values", () => {
	const previous = {
		...event("Old name"),
		recurrenceRule: recurrenceRule("FREQ=WEEKLY"),
		status: "TENTATIVE",
	};
	const current = {
		...previous,
		name: "New name",
		location: "New venue",
		description: "New description",
		start: "2026-10-25T14:00:00Z",
		end: "2026-10-25T16:00:00Z",
		recurrenceRule: recurrenceRule("FREQ=MONTHLY;BYDAY=-1SU"),
		status: "CONFIRMED",
	};
	const content = discordPayload({
		id: "test",
		kind: "updated",
		event: current,
		previous,
	}).content;
	assert.ok(
		content.includes(
			"Endret: navn, beskrivelse, sted, gjentakelse, status, tid",
		),
	);
	assert.ok(content.includes("~~Old name~~ **New name**"));
	assert.ok(content.includes("Sted: ~~Drammen~~ New venue"));
	assert.match(
		content,
		/Tid: ~~[^\n]+14:00[^\n]+16:00~~ [^\n]+15:00[^\n]+17:00/,
	);
	assert.ok(
		content.includes("Gjentakelse: ~~Hver uke~~ Hver måned, siste søndag"),
	);
	assert.ok(content.includes("Status: ~~Foreløpig~~ Bekreftet"));
	assert.ok(content.endsWith("New description"));
	const removed = discordPayload({
		id: "test",
		kind: "updated",
		previous,
		event: {
			...previous,
			location: "",
			recurrenceRule: "",
		},
	}).content;
	assert.ok(removed.includes("Endret: sted, gjentakelse"));
	assert.ok(removed.includes("Sted: ~~Drammen~~"));
	assert.ok(removed.includes("Gjentakelse: ~~Hver uke~~ Ingen gjentakelse"));
	const added = discordPayload({
		id: "test",
		kind: "updated",
		previous: { ...previous, recurrenceRule: "" },
		event: previous,
	}).content;
	assert.ok(added.includes("Gjentakelse: ~~Ingen gjentakelse~~ Hver uke"));
});

test("unknown legacy metadata and ordinary occurrence rollover are not listed as changes", () => {
	const previous = event();
	const current = {
		...previous,
		id: "next-occurrence",
		start: "2026-11-29T13:00:00Z",
		end: "2026-11-29T15:00:00Z",
		recurrenceRule: recurrenceRule("FREQ=MONTHLY;BYDAY=-1SU"),
		status: "CONFIRMED",
	};
	const content = discordPayload({
		id: "test",
		kind: "updated",
		event: current,
		previous,
	}).content;
	assert.ok(!content.includes("Endret:"));
	assert.ok(!content.includes("~~"));
	assert.ok(content.includes("Gjentakelse: Hver måned, siste søndag"));
});

test("long edit details stay within Discord's limit without splitting escaped Unicode", () => {
	const previous = {
		...event("*".repeat(1000)),
		location: "_".repeat(1000),
		recurrenceRule: "@everyone ".repeat(1000),
		status: "TENTATIVE",
	};
	const current = {
		...previous,
		name: "\u{1F308}".repeat(1000),
		location: "\\".repeat(1000),
		recurrenceRule: "@here ".repeat(1000),
		status: "CONFIRMED",
		description: "a".repeat(4000),
		start: "2026-10-25T14:00:00Z",
		end: "2026-10-25T16:00:00Z",
	};
	const payload = discordPayload({
		id: "test",
		kind: "updated",
		previous,
		event: current,
	});
	assert.equal(payload.content.length, 2000);
	assert.ok(payload.content.isWellFormed());
	assert.ok(payload.content.endsWith("a"));
	assert.ok(!payload.content.includes("@everyone"));
	assert.ok(!payload.content.includes("@here"));
	assert.deepEqual(payload.allowed_mentions.parse, []);
	assert.equal(payload.flags, 4);
});

test("Discord descriptions use the full message budget without an added footer", () => {
	const description = `${"a".repeat(1000)} Complete English translation.`;
	const notification = {
		id: "test",
		kind: "created" as const,
		event: { ...event(), description },
	};
	const complete = discordPayload(notification);
	assert.ok(
		complete.content.startsWith(
			"**📅 Et nytt arrangement har blitt opprettet 📅**",
		),
	);
	assert.ok(complete.content.endsWith(description));
	assert.ok(complete.content.length <= 2000);
	assert.ok(
		!complete.content.includes("Se kalenderen for alle datoer og unntak"),
	);
	for (const kind of ["created", "updated", "cancelled", "reminder"] as const) {
		const payload = discordPayload(
			{
				...notification,
				kind,
				event: {
					...notification.event,
					name: "*".repeat(180),
					location: "_".repeat(200),
					description: "a".repeat(4000),
				},
				previous: { ...notification.event, start: "2026-10-24T13:00:00Z" },
			},
			true,
		);
		assert.equal(payload.content.length, 2000);
		assert.ok(payload.content.endsWith("a"));
	}
});

test("Discord description limits preserve Unicode and complete escape sequences", () => {
	for (const character of ["*", "\\", "\u{1F308}", "@"]) {
		const payload = discordPayload({
			id: "test",
			kind: "created",
			event: { ...event(), description: character.repeat(3000) },
		});
		assert.ok(payload.content.length <= 2000);
		assert.ok(payload.content.length >= 1999);
		assert.ok(payload.content.isWellFormed());
		const body = payload.content.split("\n\n").at(-1)!;
		assert.equal(body.length % 2, 0);
		if (character === "@") assert.ok(body.endsWith("@\u200b"));
	}
});

test("Discord payloads suppress previews and injected mentions without disabling reminder pings", async () => {
	const notification = {
		id: "test",
		kind: "reminder" as const,
		event: {
			...event("@everyone **name**"),
			description: "<p>A &amp; B @here</p><p>https://example.test/event</p>",
		},
	};
	const payload = discordPayload(notification);
	for (const kind of ["created", "updated", "cancelled", "reminder"] as const) {
		const message = discordPayload({ ...notification, kind }, true);
		assert.equal(message.flags, 4);
		assert.ok(message.content.includes("**📅 "));
		assert.ok(message.content.endsWith("https://example.test/event"));
		assert.deepEqual(
			message.allowed_mentions.parse,
			kind === "reminder" ? ["everyone"] : [],
		);
	}
	assert.deepEqual(payload.allowed_mentions.parse, []);
	assert.ok(!payload.content.includes("@everyone"));
	assert.ok(payload.content.includes("A & B"));
	assert.ok(payload.content.length <= 2000);
	const ping = discordPayload(notification, true);
	assert.ok(ping.content.startsWith("@here\n"));
	assert.deepEqual(ping.allowed_mentions.parse, ["everyone"]);
	const updated = {
		...notification,
		kind: "updated" as const,
		previous: event("Previous occurrence", "2026-10-24T13:00:00Z"),
	};
	assert.ok(!discordPayload(updated).content.includes("Tid: ~~"));
	assert.ok(
		discordPayload({
			...updated,
			previous: { ...updated.previous, id: notification.event.id },
		}).content.includes("Tid: ~~"),
	);
	await assert.rejects(postDiscord("https://example.test/webhook", payload));
	await assert.rejects(
		postDiscord(
			"https://discord.com/api/webhooks/123/synthetic",
			payload,
			async () => new Response("rate limit", { status: 429 }),
		),
	);
	await postDiscord(
		"https://discord.com/api/webhooks/123/synthetic",
		payload,
		async (_url, options) => {
			assert.equal(options?.method, "POST");
			assert.equal(JSON.parse(String(options?.body)).flags, 4);
			assert.equal(new URL(String(_url)).searchParams.get("wait"), "true");
			return new Response("{}", { status: 200 });
		},
	);
});
