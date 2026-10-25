import { defineConfig } from "@playwright/test";

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
		},
		{
			command: "npm run dev -- --port 3000",
			url: "http://127.0.0.1:3000",
			reuseExistingServer: true,
		},
	],
});
