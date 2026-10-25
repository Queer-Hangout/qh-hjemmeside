import { createReader } from "@keystatic/core/reader";
import { cache } from "react";
import config from "../../keystatic.config";
import type { Locale } from "./locales";

export const reader = createReader(process.cwd(), config);

export const getPages = cache(async () => {
	const pages = await reader.collections.pages.all();
	const published = pages.filter(({ entry }) => entry.published);
	const paths = new Set<string>();
	for (const { entry } of published) {
		if (
			!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(entry.urlPath) ||
			/^\/(en|api|keystatic)(\/|$)/.test(entry.urlPath) ||
			entry.urlPath === "/english"
		) {
			throw new Error(`Invalid or reserved page URL: ${entry.urlPath}`);
		}
		if (paths.has(entry.urlPath))
			throw new Error(`Duplicate page URL: ${entry.urlPath}`);
		paths.add(entry.urlPath);
	}
	return published;
});

export type Page = Awaited<ReturnType<typeof getPages>>[number]["entry"];

export function pageTranslation(page: Page, locale: Locale) {
	const translated =
		locale === "en" &&
		Boolean(page.en.title.trim()) &&
		page.en.body.node.children.length > 0;
	return {
		content: translated ? page.en : page.nb,
		language: translated ? ("en" as const) : ("nb" as const),
		fallback: locale === "en" && !translated,
	};
}

export async function getNavigation(locale: Locale) {
	return (await getPages())
		.filter(({ entry }) => (entry.menuOrder ?? -1) > 0)
		.sort(
			(left, right) =>
				(left.entry.menuOrder ?? 0) - (right.entry.menuOrder ?? 0),
		)
		.map(({ entry }) => ({
			path: entry.urlPath,
			title: pageTranslation(entry, locale).content.title,
		}));
}

export const getSite = cache(async () => {
	const site = await reader.singletons.site.read();
	if (!site) throw new Error("Missing content/site.json");
	return site;
});
