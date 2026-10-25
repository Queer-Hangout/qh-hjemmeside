import { defineConfig } from "@playwright/test";

const testEnvironment = {
	NEXT_PUBLIC_SITE_URL: "https://queerhangout.no",
	NEXT_PUBLIC_KEYSTATIC_GITHUB_MODE: "false",
	NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: "",
	KEYSTATIC_GITHUB_CLIENT_ID: "",
	KEYSTATIC_GITHUB_CLIENT_SECRET: "",
	KEYSTATIC_SECRET: "",
};

export default defineConfig({
	testDir: "./tests",
	testMatch: "*.spec.ts",
	timeout: 60000,
	workers: 1,
	use: {
		baseURL: "http://127.0.0.1:3100",
		viewport: { width: 1440, height: 1000 },
		reducedMotion: "reduce",
		trace: "retain-on-failure",
	},
	webServer: [
		{
			command: "npm run build && npm run start -- --port 3100",
			url: "http://127.0.0.1:3100",
			timeout: 120000,
			env: { ...testEnvironment, NEXT_TEST_DIST_DIR: ".next/test-public" },
		},
		{
			command: "npm run dev -- --port 3101",
			url: "http://127.0.0.1:3101",
			env: { ...testEnvironment, NEXT_TEST_DIST_DIR: ".next/test-editor" },
		},
	],
});
