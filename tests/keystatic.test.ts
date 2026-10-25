import assert from "node:assert/strict";
import test from "node:test";
import { isEditorConfigured, isEditorEnabled } from "../src/lib/keystatic";
import { GET, POST } from "../src/app/api/keystatic/[...params]/route";

const credentials = {
	KEYSTATIC_GITHUB_CLIENT_ID: "synthetic-client",
	KEYSTATIC_GITHUB_CLIENT_SECRET: "synthetic-client-secret",
	KEYSTATIC_SECRET: "synthetic-session-secret",
	NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: "synthetic-app",
};

test("Vercel non-production environments cannot edit even with credentials", () => {
	for (const vercelEnvironment of ["preview", "development"]) {
		for (const nodeEnvironment of ["production", "development"]) {
			const environment = {
				...credentials,
				VERCEL: "1",
				VERCEL_ENV: vercelEnvironment,
				NODE_ENV: nodeEnvironment,
			};
			assert.equal(isEditorEnabled(environment), false);
			assert.equal(isEditorConfigured(environment), false);
		}
	}
	assert.equal(
		isEditorEnabled({
			...credentials,
			NODE_ENV: "production",
			VERCEL_ENV: "production",
			VERCEL_TARGET_ENV: "staging",
		}),
		false,
	);
	assert.equal(
		isEditorEnabled({
			...credentials,
			NODE_ENV: "production",
			VERCEL_ENV: "preview",
			VERCEL_TARGET_ENV: "production",
		}),
		false,
	);
});

test("Vercel production requires credentials and a production runtime", () => {
	const environment = {
		VERCEL: "1",
		VERCEL_ENV: "production",
		NODE_ENV: "production",
	};
	assert.equal(isEditorEnabled(environment), true);
	assert.equal(isEditorConfigured(environment), false);
	assert.equal(isEditorConfigured({ ...environment, ...credentials }), true);
	assert.equal(
		isEditorConfigured({
			...environment,
			...credentials,
			KEYSTATIC_SECRET: "",
		}),
		false,
	);
	assert.equal(
		isEditorConfigured({
			...environment,
			...credentials,
			NODE_ENV: "development",
		}),
		false,
	);
});

test("normal localhost development works, but missing deployment metadata fails closed", () => {
	assert.equal(isEditorConfigured({ NODE_ENV: "development" }), true);
	assert.equal(
		isEditorConfigured({
			...credentials,
			NODE_ENV: "development",
			NEXT_PUBLIC_KEYSTATIC_GITHUB_MODE: "true",
		}),
		true,
	);
	assert.equal(
		isEditorConfigured({ ...credentials, VERCEL: "1", NODE_ENV: "production" }),
		false,
	);
	assert.equal(
		isEditorConfigured({
			...credentials,
			VERCEL: "1",
			NODE_ENV: "development",
		}),
		false,
	);
	assert.equal(
		isEditorConfigured({ ...credentials, NODE_ENV: "production" }),
		false,
	);
});

test("preview and development API requests are denied before authentication or writes", async (context) => {
	const keys = [
		...Object.keys(credentials),
		"VERCEL",
		"VERCEL_ENV",
		"VERCEL_TARGET_ENV",
		"NODE_ENV",
	];
	const previous = new Map(keys.map((key) => [key, process.env[key]]));
	context.after(() => {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
	for (const deployment of ["preview", "development"]) {
		for (const runtime of ["production", "development"]) {
			Object.assign(process.env, credentials, {
				VERCEL: "1",
				VERCEL_ENV: deployment,
				VERCEL_TARGET_ENV: deployment,
				NODE_ENV: runtime,
			});
			for (const path of [
				"tree",
				"update",
				"github/login",
				"github/oauth/callback",
				"github/refresh-token",
			]) {
				for (const method of ["GET", "POST"]) {
					const request = new Request(
						`https://preview.example.test/api/keystatic/${path}`,
						{ method },
					);
					const response = await (method === "GET"
						? GET(request)
						: POST(request));
					assert.equal(
						response.status,
						403,
						`${deployment} ${runtime} ${method} ${path}`,
					);
					assert.equal(response.headers.get("Cache-Control"), "no-store");
					assert.deepEqual(await response.json(), {
						error: "Content editing is disabled in this environment.",
					});
				}
			}
		}
	}
});
