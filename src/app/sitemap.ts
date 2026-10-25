import type { MetadataRoute } from "next";
import { getPages, pageTranslation } from "@/lib/content";
import { isIndexable, languageAlternates, pageUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	if (!isIndexable()) return [];
	return (await getPages()).flatMap(({ entry }) => {
		const hasEnglish = !pageTranslation(entry, "en").fallback;
		const locales = hasEnglish ? (["nb", "en"] as const) : (["nb"] as const);
		return locales.map((locale) => ({
			url: pageUrl(entry.urlPath, locale),
			alternates: { languages: languageAlternates(entry.urlPath, hasEnglish) },
			priority: entry.urlPath === "/" ? 1 : 0.7,
		}));
	});
}
