import assert from "node:assert/strict";
import test from "node:test";
import {
	fingerprint,
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

test("Discord payloads suppress injected mentions and failed posts do not succeed", async () => {
	const notification = {
		id: "test",
		kind: "reminder" as const,
		event: {
			...event("@everyone **name**"),
			description: "<p>A &amp; B @here</p>",
		},
	};
	const payload = discordPayload(notification, "https://queerhangout.no");
	assert.deepEqual(payload.allowed_mentions.parse, []);
	assert.ok(!payload.content.includes("@everyone"));
	assert.ok(payload.content.includes("A & B"));
	assert.ok(payload.content.length <= 2000);
	const ping = discordPayload(notification, "https://queerhangout.no", true);
	assert.ok(ping.content.startsWith("@here\n"));
	assert.deepEqual(ping.allowed_mentions.parse, ["everyone"]);
	const updated = {
		...notification,
		kind: "updated" as const,
		previous: event("Previous occurrence", "2026-10-24T13:00:00Z"),
	};
	assert.ok(
		!discordPayload(updated, "https://queerhangout.no").content.includes(
			"Tidligere tid",
		),
	);
	assert.ok(
		discordPayload(
			{
				...updated,
				previous: { ...updated.previous, id: notification.event.id },
			},
			"https://queerhangout.no",
		).content.includes("Tidligere tid"),
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
			assert.equal(new URL(String(_url)).searchParams.get("wait"), "true");
			return new Response("{}", { status: 200 });
		},
	);
});
