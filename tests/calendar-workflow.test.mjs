import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";
import { shouldSkipBuild } from "../scripts/ignore-state-build.mjs";

const previous = "a".repeat(40);
const current = "b".repeat(40);

test("Vercel skips only notification-state changes since the successful deployment", () => {
	assert.equal(
		shouldSkipBuild(previous, current, (before, after) => {
			assert.equal(before, previous);
			assert.equal(after, current);
			return ["state/notifications.json"];
		}),
		true,
	);
	for (const files of [
		[],
		["README.md"],
		["state/other.json"],
		["state/notifications.json", "content/pages/home.json"],
		["state/notifications.json", "src/lib/calendar.ts"],
	]) {
		assert.equal(
			shouldSkipBuild(previous, current, () => files),
			false,
		);
	}
});

test("Vercel still builds on first deploy, invalid input, or missing Git history", () => {
	assert.equal(shouldSkipBuild(undefined, current), false);
	assert.equal(shouldSkipBuild("--bad-ref", current), false);
	assert.equal(shouldSkipBuild(previous, "--bad-ref"), false);
	assert.equal(
		shouldSkipBuild(previous, current, () => {
			throw new Error("Shallow history");
		}),
		false,
	);
	const result = spawnSync(
		process.execPath,
		[
			fileURLToPath(
				new URL("../scripts/ignore-state-build.mjs", import.meta.url),
			),
		],
		{
			env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: "" },
			encoding: "utf8",
		},
	);
	assert.equal(result.status, 1);
	assert.match(result.stdout, /Continuing build/);
});

test("hourly workflow is self-contained, gated, and uses trackable state", () => {
	const source = readFileSync(
		new URL("../.github/workflows/calendar-notify.yml", import.meta.url),
		"utf8",
	);
	const workflow = parse(source);
	const steps = workflow.jobs.notify.steps;
	assert.equal(
		steps.filter((step) => step.uses?.startsWith("actions/checkout@")).length,
		1,
	);
	assert.ok(
		steps.every((step) => !step.with?.repository && !step["working-directory"]),
	);
	assert.ok(
		steps.every((step) => !step.uses || /@[a-f0-9]{40}$/.test(step.uses)),
	);
	assert.equal(workflow.on.schedule[0].cron, "17 * * * *");
	assert.equal(workflow.on.workflow_dispatch.inputs.dry_run.default, true);
	assert.ok(workflow.jobs.notify.if.includes("CALENDAR_NOTIFICATIONS_ENABLED"));
	assert.equal(workflow.concurrency["cancel-in-progress"], false);
	assert.equal(workflow.on.pull_request, undefined);
	assert.match(source, /--state state\/notifications\.json/);
	assert.equal(
		spawnSync("git", [
			"check-ignore",
			"--quiet",
			"--no-index",
			"state/notifications.json",
		]).status,
		1,
	);
	assert.equal(
		spawnSync("git", [
			"check-ignore",
			"--quiet",
			"--no-index",
			"state/notifications.json.tmp",
		]).status,
		0,
	);
	const vercel = JSON.parse(
		readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
	);
	assert.equal(vercel.ignoreCommand, "node scripts/ignore-state-build.mjs");
});
