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

test("homepage text spacing does not clip content or controls", async ({
	page,
}, testInfo) => {
	await page.route("**/api/events", (route) =>
		route.fulfill({ json: { events: [] } }),
	);
	for (const path of ["/", "/en"]) {
		for (const [width, height] of [
			[320, 568],
			[390, 844],
			[1440, 900],
		]) {
			await page.setViewportSize({ width, height });
			await page.goto(path);
			await page.evaluate(() => document.fonts.ready);
			await page.addStyleTag({
				content:
					"* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }",
			});
			const result = await page.evaluate(() => {
				const hero = document.querySelector(".hero")!.getBoundingClientRect();
				return {
					clipped: [
						...document.querySelectorAll(
							".hero-location, .hero h1, .hero-copy > p, .hero-actions",
						),
					]
						.filter((element) => {
							const box = element.getBoundingClientRect();
							return box.top < hero.top - 1 || box.bottom > hero.bottom + 1;
						})
						.map((element) => element.className || element.tagName),
					overflow: document.documentElement.scrollWidth > innerWidth,
				};
			});
			expect(result, `${path} at ${width}px`).toEqual({
				clipped: [],
				overflow: false,
			});
			if (width === 320)
				await page.screenshot({
					path: testInfo.outputPath(
						`text-spacing-${path === "/" ? "nb" : "en"}.png`,
					),
					fullPage: true,
				});
		}
	}
});

test("mobile menu and language switch preserve the current page", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	const menu = page.getByRole("button", { name: "Åpne meny" });
	await menu.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("button", { name: "Lukk meny" })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
	await page.keyboard.press("Escape");
	await expect(menu).toHaveAttribute("aria-expanded", "false");
	await expect(menu).toBeFocused();
	await expect(page.locator("#mobile-navigation")).toHaveCount(0);
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await expect(page.locator("#mobile-navigation a").first()).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(menu).toHaveAttribute("aria-expanded", "false");
	await expect(menu).toBeFocused();
	await page.keyboard.press("Enter");
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
		"/en/hva-skjer",
	);
	await expect(page.locator(".support-section")).toHaveCount(0);
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
	for (const prefix of ["", "/en"]) {
		for (const retired of [
			"/innsamling",
			"/skeiv-dag/innsamling",
			"/skeiv-dag",
			"/vaare-maal",
		]) {
			const response = await request.get(`${prefix}${retired}`, {
				maxRedirects: 0,
			});
			expect(response.status()).toBe(308);
			expect(response.headers().location).toBe(`${prefix}/om-oss`);
		}
		const alias = await request.get(`${prefix}/hvaskjer`, { maxRedirects: 0 });
		expect(alias.status()).toBe(308);
		expect(alias.headers().location).toBe(`${prefix}/hva-skjer`);
	}
	const sitemap = await (await request.get("/sitemap.xml")).text();
	expect(sitemap).not.toMatch(/vaare-maal|skeiv-dag|innsamling/);
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto("/om-oss");
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
});

test.describe("SEO", () => {
	test.use({ javaScriptEnabled: false });
	test("public metadata, structured data and crawl rules work without JavaScript", async ({
		page,
		request,
	}) => {
		const production =
			!process.env.TEST_VERCEL_ENV ||
			process.env.TEST_VERCEL_ENV === "production";
		const base = "https://queerhangout.no";
		const urls: string[] = [];
		const images = new Set<string>();
		for (const slug of [
			"",
			"om-oss",
			"hva-skjer",
			"kontakt-oss",
			"regler",
			"personvern",
		]) {
			const entry = JSON.parse(
				await readFile(`content/pages/${slug || "home"}.json`, "utf8"),
			);
			const nbUrl = `${base}${slug ? `/${slug}` : ""}`;
			const enUrl = `${base}/en${slug ? `/${slug}` : ""}`;
			for (const locale of ["nb", "en"]) {
				const url = locale === "nb" ? nbUrl : enUrl;
				urls.push(url);
				const response = await page.goto(new URL(url).pathname);
				expect(response?.status(), url).toBe(200);
				expect(response?.headers()["x-robots-tag"]).toBe(
					production ? undefined : "noindex, nofollow",
				);
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await expect(page.locator("main h1")).toHaveCount(1);
				await expect(page).toHaveTitle(
					slug
						? `${entry[locale].title} | Queer Hangout`
						: "Queer Hangout | Drammen",
				);
				await expect(
					page.locator('head meta[name="description"]'),
				).toHaveAttribute("content", entry[locale].description);
				await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
					"content",
					production ? "index, follow" : "noindex, nofollow",
				);
				await expect(
					page.locator('head link[rel="canonical"]'),
				).toHaveAttribute("href", url);
				for (const [language, alternate] of [
					["nb", nbUrl],
					["en", enUrl],
					["x-default", nbUrl],
				]) {
					await expect(
						page.locator(`head link[rel="alternate"][hreflang="${language}"]`),
					).toHaveAttribute("href", alternate);
				}
				await expect(
					page.locator('head meta[property="og:url"]'),
				).toHaveAttribute("content", url);
				await expect(
					page.locator('head meta[property="og:locale"]'),
				).toHaveAttribute("content", locale === "nb" ? "nb_NO" : "en_GB");
				await expect(
					page.locator('head meta[name="twitter:card"]'),
				).toHaveAttribute("content", "summary_large_image");
				const image = await page
					.locator('head meta[property="og:image"]')
					.getAttribute("content");
				expect(image).toMatch(/^https:\/\/queerhangout\.no\/images\//);
				await expect(
					page.locator('head meta[name="twitter:image"]'),
				).toHaveAttribute("content", image!);
				images.add(new URL(image!).pathname);
				const schema = JSON.parse(
					await page.locator('script[type="application/ld+json"]').innerText(),
				);
				expect(schema["@context"]).toBe("https://schema.org");
				const graph = schema["@graph"] as Array<Record<string, unknown>>;
				expect(
					graph.find((item) => item["@type"] === "Organization"),
				).toMatchObject({
					name: "Queer Hangout",
					url: base,
					email: "post@queerhangout.no",
				});
				expect(
					graph.find((item) => item["@id"] === `${url}#webpage`),
				).toMatchObject({
					url,
					inLanguage: locale,
					description: entry[locale].description,
				});
				if (slug)
					expect(
						graph.find((item) => item["@type"] === "BreadcrumbList"),
					).toMatchObject({
						itemListElement: [
							{ position: 1, item: locale === "nb" ? base : `${base}/en` },
							{ position: 2, item: url, name: entry[locale].title },
						],
					});
			}
		}
		for (const path of images) {
			const response = await request.get(path);
			expect(response.status(), path).toBe(200);
			expect(response.headers()["content-type"]).toMatch(/^image\//);
		}
		const sitemapResponse = await request.get("/sitemap.xml");
		expect(sitemapResponse.status()).toBe(200);
		const sitemap = await sitemapResponse.text();
		if (production) {
			expect(sitemap.match(/<loc>/g)?.length).toBeGreaterThanOrEqual(
				urls.length,
			);
			for (const url of urls) expect(sitemap).toContain(`<loc>${url}</loc>`);
			expect(sitemap).toContain('hreflang="nb"');
			expect(sitemap).toContain('hreflang="en"');
			expect(sitemap).toContain('hreflang="x-default"');
		} else expect(sitemap).not.toContain("<loc>");
		const robotsResponse = await request.get("/robots.txt");
		expect(robotsResponse.status()).toBe(200);
		const robots = await robotsResponse.text();
		if (production) {
			expect(robots).toContain(`Sitemap: ${base}/sitemap.xml`);
			expect(robots).toContain("Disallow: /keystatic");
			expect(robots).toContain("Disallow: /api/");
			expect(robots).not.toMatch(/^Disallow: \/$/m);
		} else expect(robots).toMatch(/^Disallow: \/$/m);
		for (const path of ["/keystatic", "/api/keystatic/tree"]) {
			expect((await request.get(path)).headers()["x-robots-tag"]).toBe(
				"noindex, nofollow",
			);
		}
		for (const path of ["/does-not-exist", "/en/does-not-exist"]) {
			const response = await page.goto(path);
			expect(response?.status()).toBe(404);
			expect(
				await page
					.locator('meta[name="robots"]')
					.evaluateAll((tags) =>
						tags.some((tag) =>
							tag.getAttribute("content")?.includes("noindex"),
						),
					),
			).toBe(true);
		}
	});
});

test("editor deployment access is enforced", async ({ page, request }) => {
	if (
		!process.env.TEST_VERCEL_ENV ||
		process.env.TEST_VERCEL_ENV === "production"
	) {
		const editorApi = await request.get("/api/keystatic/tree");
		expect(editorApi.status()).toBe(503);
		await page.goto("/keystatic");
		await expect(
			page.getByRole("heading", { name: "Editor unavailable" }),
		).toBeVisible();
		return;
	}
	for (const path of [
		"tree",
		"update",
		"github/login",
		"github/oauth/callback",
		"github/refresh-token",
	]) {
		for (const method of ["GET", "POST"]) {
			const response = await request.fetch(`/api/keystatic/${path}`, {
				method,
				maxRedirects: 0,
			});
			expect(response.status()).toBe(403);
		}
	}
	for (const path of [
		"/keystatic",
		"/keystatic/setup",
		"/keystatic/collection/pages/item/home",
	]) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
	}
	await page.route("**/api/events", (route) =>
		route.fulfill({ json: { events: [] } }),
	);
	await page.goto("/");
	await expect(page.locator("main h1")).toBeVisible();
	await expect(page.locator('footer a[href="/keystatic"]')).toHaveCount(0);
});

test("Hap Cafe and newcomer information render in the right pages", async ({
	page,
}, testInfo) => {
	await page.route("**/api/events", (route) =>
		route.fulfill({ json: { events: [] } }),
	);
	for (const [path, width] of [
		["/hva-skjer", 1440],
		["/en/hva-skjer", 390],
	] as const) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto(path);
		await expect(
			page.getByRole("heading", { name: "Håp Cafe", exact: true }),
		).toBeVisible();
		await expect(page.locator(".prose")).toContainText("14:00-16:00");
		await expect(page.locator(".prose")).not.toContainText("Kometen");
		const photo = page.locator('img[src="/images/hva-skjer/haapcafe.jpg"]');
		await photo.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				photo.evaluate(
					(image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
				),
			)
			.toBe(true);
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
		await page.screenshot({
			path: testInfo.outputPath(`hap-cafe-${width}.png`),
			fullPage: true,
		});
	}
	await expect(page.locator(".prose")).toContainText("No hangouts in December");
	await page.goto("/en/om-oss");
	await expect(
		page.getByRole("heading", { name: "New in Norway", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Queer World", exact: true }),
	).toHaveAttribute("href", "https://www.skeivverden.no/en/");
	await expect(
		page.locator(
			'a[href^="/vaare-maal"], a[href^="/en/vaare-maal"], a[href^="/skeiv-dag"], a[href^="/en/skeiv-dag"]',
		),
	).toHaveCount(0);
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

test("calendar retries preserve focus and announce results without stealing focus", async ({
	page,
}) => {
	const fixture = {
		name: "Keyboard meetup",
		start: "2030-06-01T13:00:00+02:00",
		end: "2030-06-01T15:00:00+02:00",
		location: "Drammen",
		description: "<p>Calendar details</p>",
		allDay: false,
	};
	let events: (typeof fixture)[] | null = null;
	let responseGate: Promise<void> | undefined;
	let release: (() => void) | undefined;
	await page.route("**/api/events", async (route) => {
		if (responseGate) await responseGate;
		return events === null
			? route.fulfill({ status: 503, json: { error: "unavailable" } })
			: route.fulfill({ json: { events } });
	});
	try {
		for (const locale of ["nb", "en"]) {
			events = null;
			await page.goto(locale === "nb" ? "/hva-skjer" : "/en/hva-skjer");
			const retry = page.getByRole("button", {
				name: locale === "nb" ? "Prøv igjen" : "Try again",
			});
			const status = page.getByRole("status");
			await retry.waitFor();
			const originalStatus = await status.elementHandle();
			await retry.focus();
			await page.keyboard.press("Enter");
			await expect(retry).toBeVisible();
			await expect(status).toBeFocused();
			events = [];
			await retry.focus();
			await page.keyboard.press("Enter");
			await expect(status).toContainText(
				locale === "nb" ? "Ingen kommende" : "no upcoming",
			);
			await expect(status).toBeFocused();
			expect(
				await originalStatus!.evaluate((element) => element.isConnected),
			).toBe(true);

			events = null;
			await page.reload();
			await retry.waitFor();
			const successStatus = await status.elementHandle();
			events = [fixture];
			await retry.focus();
			await page.keyboard.press("Enter");
			const summary = page.locator(".event summary").first();
			await expect(summary).toBeFocused();
			await expect(status).toHaveText(
				locale === "nb" ? "Arrangementene er lastet." : "Events loaded.",
			);
			expect(
				await successStatus!.evaluate((element) => element.isConnected),
			).toBe(true);
			await page.keyboard.press("Enter");
			await expect(page.locator(".event")).toHaveAttribute("open", "");

			events = null;
			await page.reload();
			await retry.waitFor();
			events = [fixture];
			responseGate = new Promise<void>((resolve) => {
				release = resolve;
			});
			await retry.focus();
			await page.keyboard.press("Enter");
			await expect(status).toHaveText(
				locale === "nb" ? "Henter arrangementer" : "Loading events",
			);
			await expect(status).toBeFocused();
			await page.keyboard.press("Tab");
			const movedFocus = await page.locator(":focus").elementHandle();
			expect(await movedFocus!.evaluate((element) => element.tagName)).toBe(
				"A",
			);
			release!();
			responseGate = undefined;
			await expect(summary).toBeVisible();
			expect(
				await movedFocus!.evaluate(
					(element) => document.activeElement === element,
				),
			).toBe(true);
			expect(
				(
					await new AxeBuilder({ page })
						.withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
						.analyze()
				).violations,
			).toEqual([]);
		}
	} finally {
		release?.();
	}
});

for (const sourceSlug of ["home", "hva-skjer"]) {
	test(`local editor saves both languages and media (${sourceSlug})`, async ({
		page,
	}) => {
		const slug = `browser-test-${randomUUID()}`;
		const file = join(process.cwd(), "content/pages", `${slug}.json`);
		const original = JSON.parse(
			await readFile(`content/pages/${sourceSlug}.json`, "utf8"),
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
			`public/images/${sourceSlug}`,
		);
		await writeFile(file, JSON.stringify(fixture));
		try {
			await page.goto(
				`http://127.0.0.1:3101/keystatic/collection/pages/item/${slug}`,
			);
			const norwegian = page.getByRole("group", {
				name: "Norsk bokmal",
				exact: true,
			});
			const english = page.getByRole("group", { name: "English", exact: true });
			await expect(
				norwegian.getByRole("textbox", { name: "Title", exact: true }),
			).toHaveValue(original.nb.title);
			await english
				.getByRole("textbox", { name: "Title", exact: true })
				.fill("Browser-tested English title");
			await page.getByRole("button", { name: "Save", exact: true }).click();
			await expect
				.poll(async () => JSON.parse(await readFile(file, "utf8")).en.title)
				.toBe("Browser-tested English title");
			const saved = JSON.parse(await readFile(file, "utf8"));
			expect(saved.nb.title).toBe(original.nb.title);
			expect(saved.heroImage ?? null).toBe(fixture.heroImage);
			const image = sourceSlug === "home" ? "17mai.jpeg" : "haapcafe.jpg";
			expect(saved.nb.body).toContain(`/images/${slug}/${image}`);
			expect(saved.en.body).toContain(`/images/${slug}/${image}`);
			if (sourceSlug === "hva-skjer") {
				expect(saved.nb.body).toContain("{% events /%}");
				expect(saved.en.body).toContain("{% events /%}");
			}
			await page.goto(
				"http://127.0.0.1:3101/keystatic/collection/pages/item/hva-skjer",
			);
			await expect(
				page.getByText("Upcoming events", { exact: true }).first(),
			).toBeVisible();
		} finally {
			await rm(file, { force: true });
			await rm(join("public/images", slug), { recursive: true, force: true });
		}
	});
}
