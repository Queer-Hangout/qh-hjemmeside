import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function changedFiles(previousSha, currentSha) {
	return execFileSync(
		"git",
		[
			"diff",
			"--no-renames",
			"--name-only",
			"-z",
			previousSha,
			currentSha,
			"--",
		],
		{
			cwd: fileURLToPath(new URL("..", import.meta.url)),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		},
	)
		.split("\0")
		.filter(Boolean);
}

export function shouldSkipBuild(
	previousSha,
	currentSha = "HEAD",
	readChanges = changedFiles,
) {
	const sha = /^[a-f0-9]{40}$/i;
	if (
		!sha.test(previousSha) ||
		(currentSha !== "HEAD" && !sha.test(currentSha))
	)
		return false;
	try {
		const files = readChanges(previousSha, currentSha);
		return (
			files.length > 0 &&
			files.every((file) => file === "state/notifications.json")
		);
	} catch {
		return false;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const skip = shouldSkipBuild(
		process.env.VERCEL_GIT_PREVIOUS_SHA,
		process.env.VERCEL_GIT_COMMIT_SHA || "HEAD",
	);
	console.log(
		skip
			? "Skipping build: only calendar notification state changed."
			: "Continuing build: application changes or no usable deployment baseline.",
	);
	process.exitCode = skip ? 0 : 1;
}
