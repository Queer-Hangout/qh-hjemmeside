import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
	fetchCalendarSource,
	fingerprint,
	parseCalendar,
} from "../src/lib/calendar";
import {
	deliverNotifications,
	discordPayload,
	parseNotificationState,
	planNotifications,
	postDiscord,
	type NotificationState,
} from "../src/lib/calendar-notifications";

async function main() {
	try {
		loadEnvFile();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const { values } = parseArgs({
		options: {
			state: { type: "string", default: "state/notifications.json" },
			send: { type: "boolean", default: false },
			baseline: { type: "boolean", default: false },
		},
	});
	const source = process.env.CALENDAR_ICS_URL;
	if (!source) throw new Error("CALENDAR_ICS_URL is required");
	const statePath = resolve(values.state);
	let previous: NotificationState | null = null;
	if (!values.baseline) {
		try {
			previous = parseNotificationState(
				JSON.parse(await readFile(statePath, "utf8")),
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	const now = new Date();
	const snapshot = await parseCalendar(await fetchCalendarSource(source), now);
	const feedId = fingerprint(source);
	const plan = planNotifications(snapshot, previous, feedId, now);
	console.log(
		JSON.stringify({
			mode: values.send ? "send" : "dry-run",
			initialized: plan.initialized,
			upcomingEvents: snapshot.events.length,
			notifications: {
				created: plan.notifications.filter((item) => item.kind === "created")
					.length,
				updated: plan.notifications.filter((item) => item.kind === "updated")
					.length,
				cancelled: plan.notifications.filter(
					(item) => item.kind === "cancelled",
				).length,
				reminders: plan.notifications.filter((item) => item.kind === "reminder")
					.length,
			},
		}),
	);
	if (!values.send) return;
	const webhook = process.env.DISCORD_WEBHOOK_URL;
	if (!webhook) throw new Error("DISCORD_WEBHOOK_URL is required when sending");
	await deliverNotifications(
		snapshot,
		previous,
		feedId,
		now,
		(item) =>
			postDiscord(
				webhook,
				discordPayload(item, process.env.DISCORD_MENTION_HERE === "true"),
			),
		async (state) => {
			await mkdir(dirname(statePath), { recursive: true });
			const temporary = `${statePath}.tmp`;
			await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
			await rename(temporary, statePath);
		},
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	main().catch(() => {
		console.error(
			"Calendar check failed. Verify source availability, configuration, and state. Completed deliveries are checkpointed; credentials and feed URLs are not logged.",
		);
		process.exitCode = 1;
	});
}
