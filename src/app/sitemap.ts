import type { MetadataRoute } from "next";
import { getPages, pageTranslation } from "@/lib/content";
import { localizePath } from "@/lib/locales";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = process.env.NEXT_PUBLIC_SITE_URL || "https://queerhangout.no";
	return (await getPages()).flatMap(({ entry }) => {
		const paths = [entry.urlPath];
		if (!pageTranslation(entry, "en").fallback)
			paths.push(localizePath(entry.urlPath, "en"));
		return paths.map((path) => ({
			url: `${base}${path}`,
			priority: entry.urlPath === "/" ? 1 : 0.7,
		}));
	});
}
