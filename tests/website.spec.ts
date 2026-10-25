import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rebasePageAssets } from "../scripts/import-legacy";

test("homepage renders without overflow, broken assets, or accessibility violations", async ({
	page,
}, testInfo) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.route("**/api/events", (route) =>
		route.fulfill({ status: 503, json: { error: "events_unavailable" } }),
	);
	for (const width of [320, 390, 768, 1440, 1920]) {
		await page.setViewportSize({ width, height: width < 650 ? 844 : 1000 });
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: "Queer Hangout.", exact: true }),
		).toBeVisible();
		await expect(page.getByRole("status")).toContainText("Vi får ikke hentet");
		await page.evaluate(() => document.fonts.ready);
		const dimensions = await page.evaluate(() => ({
			viewport: innerWidth,
			width: document.documentElement.scrollWidth,
			nextSection: document
				.querySelector(".welcome-strip")!
				.getBoundingClientRect().top,
			height: innerHeight,
			heroLoaded:
				document.querySelector<HTMLImageElement>(".hero-image")!.naturalWidth >
				0,
		}));
		expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
		expect(dimensions.nextSection).toBeLessThan(dimensions.height);
		expect(dimensions.heroLoaded).toBe(true);
		if (width === 390 || width === 1440) {
			await page.screenshot({
				path: testInfo.outputPath(`home-${width}.png`),
				fullPage: true,
			});
			const accessibility = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
				.analyze();
			expect(accessibility.violations).toEqual([]);
		}
	}
	expect(errors).toEqual([]);
});

test("mobile menu and language switch preserve the current page", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	const menu = page.getByRole("button", { name: "Åpne meny" });
	await menu.click();
	await expect(page.getByRole("button", { name: "Lukk meny" })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
	await page
		.locator("#mobile-navigation")
		.getByRole("link", { name: "Om oss", exact: true })
		.click();
	await expect(page).toHaveURL(/\/om-oss$/);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Om oss");
	await page.getByRole("link", { name: "Read in English" }).click();
	await expect(page).toHaveURL(/\/en\/om-oss$/);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("About us");
	await expect(page.locator(".language-notice")).toHaveCount(0);
	await expect(page.locator("article > div")).toHaveAttribute("lang", "en");
	await page.getByRole("link", { name: "Les på norsk" }).click();
	await expect(page).toHaveURL(/\/om-oss$/);
});

test("English routes show the matching translated pages", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route("**/api/events", (route) =>
		route.fulfill({ json: { events: [] } }),
	);
	const pages = {
		"/en": "Queer Hangout.",
		"/en/om-oss": "About us",
		"/en/hva-skjer": "What's on?",
		"/en/kontakt-oss": "Contact us",
		"/en/regler": "Guidelines",
		"/en/vaare-maal": "Our goals, big and small",
		"/en/skeiv-dag": "Skeiv Dag at Strømsø Knutepunkt, 1 June 2025",
		"/en/skeiv-dag/innsamling":
			"Second-hand market for gender-affirming surgery",
		"/en/personvern": "Privacy",
	};
	for (const [path, title] of Object.entries(pages)) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(200);
		await expect(page.locator("main h1")).toHaveText(title, {
			useInnerText: true,
		});
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page.locator(".language-notice")).toHaveCount(0);
		await expect(page.locator(".prose").first().locator("..")).toHaveAttribute(
			"lang",
			"en",
		);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			`https://queerhangout.no${path}`,
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
	}
	await page.goto("/en");
	await expect(page.locator(".event-message")).toHaveCount(1);
	await expect(
		page.getByRole("heading", {
			name: /^(Activities|Rules|Contact information)$/,
		}),
	).toHaveCount(0);
	await expect(page.locator(".prose a")).toHaveAttribute(
		"href",
		"/en/vaare-maal",
	);
});

test("legacy URLs, content pages, metadata and 404 handling work", async ({
	page,
	request,
}) => {
	const paths = [
		"/",
		"/om-oss",
		"/hva-skjer",
		"/kontakt-oss",
		"/regler",
		"/vaare-maal",
		"/skeiv-dag",
		"/skeiv-dag/innsamling",
		"/personvern",
	];
	await page.route("**/api/events", (route) =>
		route.fulfill({ json: { events: [] } }),
	);
	for (const path of paths) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(200);
		await expect(page.locator("main h1")).toHaveCount(1);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			`https://queerhangout.no${path === "/" ? "" : path}`,
		);
	}
	const english = await request.get("/english", { maxRedirects: 0 });
	expect(english.status()).toBe(308);
	expect(english.headers().location).toBe("/en");
	const fundraising = await request.get("/innsamling", { maxRedirects: 0 });
	expect(fundraising.headers().location).toBe("/skeiv-dag/innsamling");
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto("/skeiv-dag/innsamling");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	const missing = await request.get("/does-not-exist");
	expect(missing.status()).toBe(404);
	await page.goto("/en/personvern");
	await expect(page.locator("main h1")).toHaveText("Privacy");
	expect(
		(await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
			.violations,
	).toEqual([]);
	const editorApi = await request.get("/api/keystatic/tree");
	expect(editorApi.status()).toBe(503);
	await page.goto("/keystatic");
	await expect(
		page.getByRole("heading", { name: "Editor unavailable" }),
	).toBeVisible();
});

test("calendar empty, success, expansion, error, and retry states work", async ({
	page,
}) => {
	let requests = 0;
	await page.route("**/api/events", (route) => {
		requests += 1;
		return route.fulfill({ status: 503, json: { error: "unavailable" } });
	});
	await page.goto("/hva-skjer");
	await expect(page.getByRole("status")).toContainText("Vi får ikke hentet");
	const before = requests;
	await page.getByRole("button", { name: "Prøv igjen" }).click();
	await expect.poll(() => requests).toBeGreaterThan(before);
	await page.unroute("**/api/events");
	await page.route("**/api/events", (route) =>
		route.fulfill({ json: { events: [] } }),
	);
	await page.reload();
	await expect(page.getByRole("status")).toContainText("Ingen kommende");
	await page.unroute("**/api/events");
	await page.route("**/api/events", (route) =>
		route.fulfill({
			json: {
				events: [
					{
						name: "Test meetup",
						start: "2030-06-01T13:00:00+02:00",
						end: "2030-06-01T15:00:00+02:00",
						location: "Drammen",
						description: "<p>Calendar details</p>",
						allDay: false,
					},
				],
			},
		}),
	);
	await page.reload();
	await page.locator(".event summary").click();
	await expect(page.locator(".event")).toHaveAttribute("open", "");
	await expect(page.getByText("Calendar details")).toBeVisible();
});

test("local editor saves both languages and preserves existing media", async ({
	page,
}) => {
	const slug = `browser-test-${randomUUID()}`;
	const file = join(process.cwd(), "content/pages", `${slug}.json`);
	const original = JSON.parse(
		await readFile("content/pages/home.json", "utf8"),
	);
	const fixture = await rebasePageAssets(
		slug,
		{
			...original,
			name: "Browser test",
			urlPath: `/${slug}`,
			published: false,
			menuOrder: -1,
		},
		"public/images/home",
	);
	await writeFile(file, JSON.stringify(fixture));
	try {
		await page.goto(
			`http://127.0.0.1:3000/keystatic/collection/pages/item/${slug}`,
		);
		const norwegian = page.getByRole("group", {
			name: "Norsk bokmal",
			exact: true,
		});
		const english = page.getByRole("group", { name: "English", exact: true });
		await expect(
			norwegian.getByRole("textbox", { name: "Title", exact: true }),
		).toHaveValue("Hjem");
		await english
			.getByRole("textbox", { name: "Title", exact: true })
			.fill("Browser-tested English title");
		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect
			.poll(async () => JSON.parse(await readFile(file, "utf8")).en.title)
			.toBe("Browser-tested English title");
		const saved = JSON.parse(await readFile(file, "utf8"));
		expect(saved.nb.title).toBe(original.nb.title);
		expect(saved.heroImage).toBe(fixture.heroImage);
		expect(saved.nb.body).toContain(`/images/${slug}/17mai.jpeg`);
		expect(saved.en.body).toContain(`/images/${slug}/17mai.jpeg`);
		await page.goto(
			"http://127.0.0.1:3000/keystatic/collection/pages/item/hva-skjer",
		);
		await expect(
			page.getByText("Upcoming events", { exact: true }).first(),
		).toBeVisible();
	} finally {
		await rm(file, { force: true });
		await rm(join("public/images", slug), { recursive: true, force: true });
	}
});
