import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexable } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
	if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/keystatic", "/api/"] },
		sitemap: `${getSiteUrl()}/sitemap.xml`,
	};
}
