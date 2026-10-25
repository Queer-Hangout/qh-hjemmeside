import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/keystatic", "/api/"] },
		sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://queerhangout.no"}/sitemap.xml`,
	};
}
