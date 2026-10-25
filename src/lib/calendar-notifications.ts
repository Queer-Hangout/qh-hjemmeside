import { convert } from "html-to-text";
import {
	calendarDay,
	fingerprint,
	type CalendarOccurrence,
	type CalendarSeries,
	type CalendarSnapshot,
} from "./calendar";

export type NotificationState = {
	version: 1;
	feedId: string;
	lastSuccessfulCheck: string;
	series: CalendarSeries[];
	sentChanges: string[];
	reminders: Record<string, string>;
};

export type CalendarNotification = {
	id: string;
	kind: "created" | "updated" | "cancelled" | "reminder";
	event: CalendarOccurrence;
	previous?: CalendarOccurrence;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validOccurrence(value: unknown): boolean {
	if (!isObject(value)) return false;
	return (
		["id", "seriesId", "name", "start", "location", "description"].every(
			(key) => typeof value[key] === "string",
		) &&
		typeof value.allDay === "boolean" &&
		Number.isFinite(Date.parse(String(value.start))) &&
		(value.end === null ||
			(typeof value.end === "string" && Number.isFinite(Date.parse(value.end))))
	);
}

export function parseNotificationState(value: unknown): NotificationState {
	if (
		!isObject(value) ||
		value.version !== 1 ||
		typeof value.feedId !== "string" ||
		typeof value.lastSuccessfulCheck !== "string" ||
		!Number.isFinite(Date.parse(value.lastSuccessfulCheck)) ||
		!Array.isArray(value.series) ||
		!value.series.every(
			(item) =>
				isObject(item) &&
				typeof item.id === "string" &&
				typeof item.fingerprint === "string" &&
				(item.next === null || validOccurrence(item.next)),
		) ||
		!Array.isArray(value.sentChanges) ||
		!value.sentChanges.every((item) => typeof item === "string") ||
		!isObject(value.reminders) ||
		!Object.entries(value.reminders).every(
			([key, date]) =>
				/^[a-f0-9]{64}$/.test(key) &&
				typeof date === "string" &&
				Number.isFinite(Date.parse(date)),
		)
	) {
		throw new Error(
			"Invalid notification state; refusing to reset it automatically",
		);
	}
	return value as NotificationState;
}

function upcoming(
	event: CalendarOccurrence | null,
	now: Date,
): event is CalendarOccurrence {
	if (!event) return false;
	return event.allDay
		? (event.end ?? event.start).slice(0, 10) > calendarDay(now)
		: Date.parse(event.end ?? event.start) >= now.getTime();
}

export function planNotifications(
	snapshot: CalendarSnapshot,
	previous: NotificationState | null,
	feedId: string,
	now: Date,
) {
	const state: NotificationState = previous
		? structuredClone(previous)
		: {
				version: 1,
				feedId,
				lastSuccessfulCheck: now.toISOString(),
				series: snapshot.series,
				sentChanges: [],
				reminders: {},
			};
	if (state.feedId !== feedId)
		throw new Error(
			"Calendar source changed; review it and initialize a new baseline",
		);
	const notifications: CalendarNotification[] = [];
	if (!previous) return { state, notifications, initialized: true };
	const oldSeries = new Map(previous.series.map((item) => [item.id, item]));
	const newSeries = new Map(snapshot.series.map((item) => [item.id, item]));
	for (const id of new Set([...oldSeries.keys(), ...newSeries.keys()])) {
		const before = oldSeries.get(id);
		const after = newSeries.get(id);
		if (before?.fingerprint === after?.fingerprint) continue;
		const event = after?.next ?? before?.next ?? null;
		if (!upcoming(event, now)) continue;
		const kind = !after?.next ? "cancelled" : before ? "updated" : "created";
		const notificationId = fingerprint([
			kind,
			id,
			before?.fingerprint ?? null,
			after?.fingerprint ?? null,
		]);
		if (!state.sentChanges.includes(notificationId)) {
			notifications.push({
				id: notificationId,
				kind,
				event,
				previous: before?.next ?? undefined,
			});
		}
	}
	const hour = Number(
		new Intl.DateTimeFormat("en-GB", {
			timeZone: "Europe/Oslo",
			hour: "2-digit",
			hourCycle: "h23",
		}).format(now),
	);
	if (hour >= 9) {
		const tomorrow = new Date(`${calendarDay(now)}T12:00:00Z`);
		tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
		const targetDay = tomorrow.toISOString().slice(0, 10);
		for (const event of snapshot.events) {
			const day = event.allDay
				? event.start
				: calendarDay(new Date(event.start));
			const id = fingerprint(["reminder", event.id, event.start]);
			if (day === targetDay && !state.reminders[id])
				notifications.push({ id, kind: "reminder", event });
		}
	}
	return { state, notifications, initialized: false };
}

export async function deliverNotifications(
	snapshot: CalendarSnapshot,
	previous: NotificationState | null,
	feedId: string,
	now: Date,
	send: (notification: CalendarNotification) => Promise<void>,
	persist: (state: NotificationState) => Promise<void>,
): Promise<NotificationState> {
	const { state, notifications } = planNotifications(
		snapshot,
		previous,
		feedId,
		now,
	);
	for (const notification of notifications) {
		await send(notification);
		if (notification.kind === "reminder")
			state.reminders[notification.id] = notification.event.start;
		else {
			state.sentChanges.push(notification.id);
			state.series = state.series.filter(
				(item) => item.id !== notification.event.seriesId,
			);
			const current = snapshot.series.find(
				(item) => item.id === notification.event.seriesId,
			);
			if (current) state.series.push(current);
		}
		await persist(structuredClone(state));
	}
	state.series = snapshot.series;
	state.sentChanges = [];
	state.lastSuccessfulCheck = now.toISOString();
	const cutoff = new Date(now.getTime() - 14 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	state.reminders = Object.fromEntries(
		Object.entries(state.reminders).filter(
			([, date]) => date.slice(0, 10) >= cutoff,
		),
	);
	await persist(structuredClone(state));
	return state;
}

function discordText(value: string, length: number): string {
	return value
		.slice(0, length)
		.replace(/([\\`*_\[\]()<>|~])/g, "\\$1")
		.replace(/@/g, "@\u200b");
}

function eventTime(event: CalendarOccurrence): string {
	const start = new Date(event.start);
	if (event.allDay)
		return new Intl.DateTimeFormat("nb-NO", {
			timeZone: "Europe/Oslo",
			dateStyle: "full",
		}).format(start);
	const format = new Intl.DateTimeFormat("nb-NO", {
		timeZone: "Europe/Oslo",
		dateStyle: "short",
		timeStyle: "short",
	});
	return `${format.format(start)}${event.end ? ` - ${format.format(new Date(event.end))}` : ""}`;
}

const SUPPRESS_EMBEDS = 1 << 2;
const DISCORD_MESSAGE_LIMIT = 2000;

export function discordPayload(
	notification: CalendarNotification,
	mentionHere = false,
) {
	const labels = {
		created: "Et nytt arrangement har blitt opprettet",
		updated: "Et arrangement har blitt endret",
		cancelled: "Et arrangement har blitt avlyst",
		reminder: "Påminnelse: arrangement i morgen",
	};
	const { event } = notification;
	const description = convert(event.description, {
		wordwrap: false,
		selectors: [{ selector: "a", options: { ignoreHref: true } }],
	});
	const ping = mentionHere && notification.kind === "reminder";
	const previousTime =
		notification.kind === "updated" &&
		notification.previous?.id === event.id &&
		(notification.previous.start !== event.start ||
			notification.previous.end !== event.end)
			? `\nTidligere tid: ${eventTime(notification.previous)}`
			: "";
	const header = `${ping ? "@here\n" : ""}**📅 ${labels[notification.kind]} 📅**\n\n**${discordText(event.name, 180)}**\nTid: ${eventTime(event)}${previousTime}${event.location ? `\nSted: ${discordText(event.location, 200)}` : ""}\n\n`;
	const available = DISCORD_MESSAGE_LIMIT - header.length;
	if (available < 0) throw new Error("Notification details exceed Discord's message limit");
	let body = "";
	for (const character of description) {
		const escaped = discordText(character, character.length);
		if (body.length + escaped.length > available) break;
		body += escaped;
	}
	return {
		content: `${header}${body}`,
		flags: SUPPRESS_EMBEDS,
		allowed_mentions: { parse: ping ? ["everyone"] : [] },
	};
}

export async function postDiscord(
	webhook: string,
	payload: ReturnType<typeof discordPayload>,
	fetcher: typeof fetch = fetch,
) {
	const url = new URL(webhook);
	if (
		url.protocol !== "https:" ||
		!["discord.com", "discordapp.com"].includes(url.hostname) ||
		url.username ||
		url.password ||
		url.port ||
		!/^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname)
	) {
		throw new Error("Invalid Discord webhook URL");
	}
	url.searchParams.set("wait", "true");
	const response = await fetcher(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(15_000),
		redirect: "error",
	});
	if (!response.ok)
		throw new Error(
			"Discord delivery failed; the next run will resume pending messages",
		);
}
