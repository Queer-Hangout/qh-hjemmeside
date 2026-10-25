import assert from "node:assert/strict";
import {
	access,
	mkdtemp,
	mkdir,
	readFile,
	writeFile,
	rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReader } from "@keystatic/core/reader";
import config from "../keystatic.config";
import { convertLegacy, splitEnglishSummary } from "../scripts/import-legacy";
import { localizePath, resolveRoute } from "../src/lib/locales";
import { getPages, pageTranslation } from "../src/lib/content";
import Markdoc from "@markdoc/markdoc";

test("Keystatic reads two rich-text languages from one JSON entry", async () => {
	const directory = await mkdtemp(join(tmpdir(), "qh-content-"));
	try {
		await mkdir(join(directory, "content/pages"), { recursive: true });
		await writeFile(
			join(directory, "content/pages/home.json"),
			JSON.stringify({
				name: "Home",
				urlPath: "/",
				published: true,
				menuOrder: 0,
				template: "home",
				heroImage: null,
				heroAlt: { nb: "", en: "" },
				photoCredit: "",
				nb: {
					title: "Hei",
					description: "",
					introduction: "",
					body: "## Velkommen\n\nEt fellesskap.",
				},
				en: {
					title: "Hello",
					description: "",
					introduction: "",
					body: "## Welcome\n\nA community.",
				},
			}),
		);
		const page = await createReader(directory, config).collections.pages.read(
			"home",
		);
		assert.ok(page);
		assert.equal(page.nb.title, "Hei");
		assert.equal(page.en.title, "Hello");
		assert.equal(page.nb.body.node.type, "document");
		assert.equal(page.en.body.node.children[0].type, "heading");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("legacy imports become safe content and events become a supported block", () => {
	const result = convertLegacy(
		'import EventsList from "./events"\n\n# Old title\n\nHello **world**.\n\n<Link to="/regler">Rules</Link>\n\n<EventsList />\n\n![People](../images/ute.jpg "Photo credit")',
	);
	assert.ok(!result.includes("import "));
	assert.ok(!result.includes("Old title"));
	assert.ok(result.includes("[Rules](/regler)"));
	assert.ok(result.includes("{% events /%}"));
	assert.ok(result.includes('/images/ute.jpg "Photo credit"'));
});

test("language routes preserve nested legacy paths without rewriting external links", () => {
	assert.equal(
		localizePath("/skeiv-dag/innsamling", "en"),
		"/en/skeiv-dag/innsamling",
	);
	assert.equal(localizePath("/innsamling", "nb"), "/skeiv-dag/innsamling");
	assert.equal(localizePath("/", "en"), "/en");
	assert.equal(
		localizePath("https://example.org", "en"),
		"https://example.org",
	);
	assert.equal(localizePath("/en/om-oss", "en"), "/en/om-oss");
	assert.deepEqual(resolveRoute(["en", "skeiv-dag", "innsamling"]), {
		locale: "en",
		path: "/skeiv-dag/innsamling",
	});
});

test("legacy English sections are assigned to their matching pages", () => {
	const sections = splitEnglishSummary(
		"## About us\n\nOur community.\n\n## Activities\n\n### Upcoming events\n\n{% events /%}\n\n## Rules\n\nRespect each other.\n\n### Reporting a concern\n\nContact the leader.\n\n## Contact information\n\nEmail us.",
	);
	assert.equal(sections["/"], "Our community.\n");
	assert.match(sections["/om-oss"], /Our community/);
	assert.match(sections["/hva-skjer"], /^## Upcoming events/m);
	assert.match(sections["/hva-skjer"], /\{% events \/%\}/);
	assert.match(sections["/regler"], /Respect each other/);
	assert.match(sections["/regler"], /Reporting a concern/);
	assert.match(sections["/kontakt-oss"], /Email us/);
	assert.doesNotMatch(sections["/om-oss"], /events|Respect|Email/);
	assert.throws(() => splitEnglishSummary("## Unmapped section\n\nText."));
});

test("all migrated content validates, image files exist, and translations fall back explicitly", async () => {
	const pages = await getPages();
	assert.ok(pages.length >= 9);
	const paths = new Set(pages.map(({ entry }) => entry.urlPath));
	assert.ok(paths.has("/skeiv-dag/innsamling"));
	for (const { entry } of pages) {
		for (const locale of ["nb", "en"] as const) {
			const { node } = entry[locale].body;
			assert.deepEqual(
				Markdoc.validate(node, {
					tags: { events: { render: "Events", selfClosing: true } },
				}),
				[],
				`${entry.urlPath} ${locale}`,
			);
			for (const child of node.walk()) {
				if (child.type === "image")
					await access(join(process.cwd(), "public", child.attributes.src));
				if (child.type === "link" && child.attributes.href.startsWith("/")) {
					assert.ok(
						paths.has(child.attributes.href) ||
							child.attributes.href === "/english",
						child.attributes.href,
					);
				}
			}
		}
	}
	const home = pages.find(({ entry }) => entry.urlPath === "/")!.entry;
	assert.equal(pageTranslation(home, "en").fallback, false);
	const about = pages.find(({ entry }) => entry.urlPath === "/om-oss")!.entry;
	assert.equal(pageTranslation(about, "en").fallback, false);
	const untranslated = { ...about, en: { ...about.en, title: "" } };
	assert.equal(pageTranslation(untranslated, "en").fallback, true);
});

test("each migrated page has its own English content, not a single summary page", async () => {
	for (const { entry } of await getPages()) {
		assert.equal(pageTranslation(entry, "en").fallback, false, entry.urlPath);
		assert.ok(
			entry.en.description.trim(),
			`${entry.urlPath} needs an English description`,
		);
	}
	const home = JSON.parse(await readFile("content/pages/home.json", "utf8"));
	assert.doesNotMatch(
		home.en.body,
		/^## (Activities|Rules|Contact information)$/m,
	);
	assert.doesNotMatch(home.en.body, /\{%\s*events\s*\/\s*%\}/);
});
