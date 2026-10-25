import { copy, localizePath, type Locale } from "./locales";

export function getSiteUrl(
	environment: Record<string, string | undefined> = process.env,
): string {
	const url = new URL(
		environment.NEXT_PUBLIC_SITE_URL || "https://queerhangout.no",
	);
	if (
		!["https:", "http:"].includes(url.protocol) ||
		url.username ||
		url.password
	) {
		throw new Error(
			"NEXT_PUBLIC_SITE_URL must be an HTTP(S) site URL without credentials",
		);
	}
	return url.origin;
}

export function isIndexable(
	environment: Record<string, string | undefined> = process.env,
): boolean {
	if (environment.NODE_ENV !== "production") return false;
	if (
		environment.VERCEL ||
		environment.VERCEL_ENV ||
		environment.VERCEL_TARGET_ENV
	) {
		return (
			environment.VERCEL_ENV === "production" &&
			(!environment.VERCEL_TARGET_ENV ||
				environment.VERCEL_TARGET_ENV === "production")
		);
	}
	return true;
}

export function pageUrl(path: string, locale: Locale): string {
	const localized = localizePath(path, locale);
	return `${getSiteUrl()}${localized === "/" ? "" : localized}`;
}

export function languageAlternates(path: string, hasEnglish: boolean) {
	return {
		nb: pageUrl(path, "nb"),
		...(hasEnglish ? { en: pageUrl(path, "en") } : {}),
		"x-default": pageUrl(path, "nb"),
	};
}

export function pageStructuredData(
	page: {
		path: string;
		title: string;
		description: string;
		language: Locale;
		image: string;
		imageAlt: string;
	},
	site: { email: string; facebook: string | null; organizationNumber: string },
) {
	const base = getSiteUrl();
	const url = pageUrl(page.path, page.language);
	const organizationId = `${base}/#organization`;
	const websiteId = `${base}/#website`;
	const breadcrumbId = `${url}#breadcrumb`;
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "Organization",
				"@id": organizationId,
				name: "Queer Hangout",
				url: base,
				logo: `${base}/images/qh-logo.png`,
				email: site.email,
				...(site.facebook ? { sameAs: [site.facebook] } : {}),
				...(site.organizationNumber
					? {
							identifier: {
								"@type": "PropertyValue",
								name: "Organisasjonsnummer",
								value: site.organizationNumber,
							},
						}
					: {}),
				areaServed: { "@type": "City", name: "Drammen" },
			},
			{
				"@type": "WebSite",
				"@id": websiteId,
				name: "Queer Hangout",
				url: base,
				inLanguage: ["nb", "en"],
				publisher: { "@id": organizationId },
			},
			{
				"@type":
					page.path === "/om-oss"
						? "AboutPage"
						: page.path === "/kontakt-oss"
							? "ContactPage"
							: "WebPage",
				"@id": `${url}#webpage`,
				url,
				name: page.title,
				description: page.description,
				inLanguage: page.language,
				isPartOf: { "@id": websiteId },
				about: { "@id": organizationId },
				primaryImageOfPage: {
					"@type": "ImageObject",
					url: new URL(page.image, `${base}/`).href,
					caption: page.imageAlt,
				},
				...(page.path === "/" ? {} : { breadcrumb: { "@id": breadcrumbId } }),
			},
			...(page.path === "/"
				? []
				: [
						{
							"@type": "BreadcrumbList",
							"@id": breadcrumbId,
							itemListElement: [
								{
									"@type": "ListItem",
									position: 1,
									name: copy[page.language].home,
									item: pageUrl("/", page.language),
								},
								{
									"@type": "ListItem",
									position: 2,
									name: page.title,
									item: url,
								},
							],
						},
					]),
		],
	};
}

export function serializeStructuredData(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}
