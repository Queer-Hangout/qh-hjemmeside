import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	ArrowRight,
	ArrowUpRight,
	Heart,
	MapPin,
	MessageCircle,
	Sparkles,
} from "lucide-react";
import {
	getNavigation,
	getPages,
	getSite,
	pageTranslation,
} from "@/lib/content";
import { copy, localizePath, type Locale } from "@/lib/locales";
import {
	getSiteUrl,
	isIndexable,
	languageAlternates,
	pageUrl,
	pageStructuredData,
	serializeStructuredData,
} from "@/lib/seo";
import { Header } from "./header";
import { Footer } from "./footer";
import { RichText } from "./rich-text";
import { EventsList } from "./events-list";

export type PageProps = { params: Promise<{ slug?: string[] }> };
export const siteUrl = getSiteUrl();

export async function staticPaths() {
	return (await getPages()).map(({ entry }) => ({
		slug: entry.urlPath.split("/").filter(Boolean),
	}));
}

export async function pageMetadata(
	props: PageProps,
	locale: Locale,
): Promise<Metadata> {
	const { slug = [] } = await props.params;
	const path = `/${slug.join("/")}`;
	const page = (await getPages()).find(
		({ entry }) => entry.urlPath === path,
	)?.entry;
	if (!page) return { title: copy[locale].notFound, robots: { index: false } };
	const { content, language, fallback } = pageTranslation(page, locale);
	const hasEnglish = !pageTranslation(page, "en").fallback;
	const title =
		path === "/"
			? "Queer Hangout | Drammen"
			: `${content.title} | Queer Hangout`;
	const image = {
		url: new URL(page.heroImage || "/images/skeivdag1.jpg", `${siteUrl}/`).href,
		alt: page.heroAlt[language] || "Queer Hangout i Drammen",
	};
	return {
		metadataBase: new URL(siteUrl),
		title,
		description: content.description,
		robots: isIndexable()
			? { index: !fallback, follow: true }
			: { index: false, follow: false },
		icons: { icon: "/icon.png", apple: "/icon.png" },
		alternates: {
			canonical: pageUrl(path, language),
			languages: languageAlternates(path, hasEnglish),
		},
		openGraph: {
			title,
			description: content.description,
			siteName: "Queer Hangout",
			locale: language === "nb" ? "nb_NO" : "en_GB",
			alternateLocale: hasEnglish
				? [language === "nb" ? "en_GB" : "nb_NO"]
				: [],
			type: "website",
			url: pageUrl(path, language),
			images: [image],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description: content.description,
			images: [image],
		},
	};
}

export async function SitePage({
	props,
	locale,
}: {
	props: PageProps;
	locale: Locale;
}) {
	const { slug = [] } = await props.params;
	const path = `/${slug.join("/")}`;
	const [pages, navigation, site] = await Promise.all([
		getPages(),
		getNavigation(locale),
		getSite(),
	]);
	const page = pages.find(({ entry }) => entry.urlPath === path)?.entry;
	if (!page) notFound();
	const { content, language, fallback } = pageTranslation(page, locale);
	const text = copy[locale];
	const facebook = site.facebook || "https://www.facebook.com/queerhangout";
	const home = page.template === "home";

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: serializeStructuredData(
						pageStructuredData(
							{
								path,
								title: home ? "Queer Hangout" : content.title,
								description: content.description,
								language,
								image: page.heroImage || "/images/skeivdag1.jpg",
								imageAlt: page.heroAlt[language] || "Queer Hangout i Drammen",
							},
							site,
						),
					),
				}}
			/>
			<Header
				key={`${locale}-${path}`}
				locale={locale}
				path={path}
				navigation={navigation}
			/>
			<main id="main">
				{home ? (
					<>
						<section className="hero" aria-labelledby="hero-title">
							<Image
								className="hero-image"
								src={page.heroImage || "/images/skeivdag1.jpg"}
								alt={page.heroAlt[locale] || page.heroAlt.nb}
								fill
								priority
								sizes="100vw"
							/>
							<div className="hero-shade" />
							<div className="hero-inner container">
								<div className="hero-copy">
									<span className="eyebrow hero-location">
										<MapPin size={16} aria-hidden="true" />
										{text.place}
									</span>
									<h1 id="hero-title">
										Queer
										<br />
										Hangout<span>.</span>
									</h1>
									<p>{content.introduction}</p>
									<div className="hero-actions">
										<Link
											className="button button-yellow"
											href={localizePath("/hva-skjer", locale)}
										>
											{text.events}
											<ArrowUpRight size={21} aria-hidden="true" />
										</Link>
										<Link
											className="hero-secondary"
											href={localizePath("/om-oss", locale)}
										>
											{text.about}
											<ArrowRight size={19} aria-hidden="true" />
										</Link>
									</div>
								</div>
							</div>
							{page.photoCredit && (
								<span className="hero-credit">{page.photoCredit}</span>
							)}
						</section>
						<div className="welcome-strip">
							<span>{text.welcome}</span>
							<Heart size={18} aria-hidden="true" />
							<span>{text.sober}</span>
							<Sparkles size={18} aria-hidden="true" />
							<span>{text.place}</span>
						</div>
						<section
							className="events-section container"
							aria-labelledby="events-heading"
						>
							<div className="section-heading">
								<div>
									<span className="eyebrow">{text.events}</span>
									<h2 id="events-heading">{text.nextEvents}</h2>
									<p>{text.eventsIntro}</p>
								</div>
								<Link
									className="text-link"
									href={localizePath("/hva-skjer", locale)}
								>
									{text.allEvents}
									<ArrowUpRight size={19} aria-hidden="true" />
								</Link>
							</div>
							<EventsList locale={locale} facebook={facebook} limit={3} />
						</section>
						<section className="community-section">
							<div className="community-inner container">
								<div className="community-heading">
									<span className="eyebrow">Queer Hangout</span>
									<h2>{text.community}</h2>
									<Link
										className="text-link"
										href={localizePath("/om-oss", locale)}
									>
										{text.about}
										<ArrowUpRight size={19} aria-hidden="true" />
									</Link>
								</div>
								<div lang={language}>
									<RichText
										node={content.body.node}
										locale={locale}
										facebook={facebook}
									/>
								</div>
							</div>
						</section>
						<section
							className="values-section container"
							aria-label={
								locale === "nb" ? "Fellesskapet vårt" : "Our community"
							}
						>
							<div>
								<Heart size={29} strokeWidth={1.5} aria-hidden="true" />
								<h2>{text.welcome}</h2>
								<p>{text.welcomeBody}</p>
								<Link
									className="text-link"
									href={localizePath("/regler", locale)}
								>
									{text.rules}
									<ArrowUpRight size={17} aria-hidden="true" />
								</Link>
							</div>
							<div>
								<Sparkles size={29} strokeWidth={1.5} aria-hidden="true" />
								<h2>{text.sober}</h2>
								<p>{text.soberBody}</p>
								<Link
									className="text-link"
									href={localizePath("/hva-skjer", locale)}
								>
									{text.events}
									<ArrowUpRight size={17} aria-hidden="true" />
								</Link>
							</div>
							<div>
								<MessageCircle size={29} strokeWidth={1.5} aria-hidden="true" />
								<h2>{text.access}</h2>
								<p>{text.accessBody}</p>
								<Link
									className="text-link"
									href={localizePath("/kontakt-oss", locale)}
								>
									{text.contact}
									<ArrowUpRight size={17} aria-hidden="true" />
								</Link>
							</div>
						</section>
					</>
				) : (
					<>
						<div className="page-title-band">
							<div className="container">
								<Link className="breadcrumb" href={localizePath("/", locale)}>
									{text.home}
								</Link>
								<h1 lang={language}>{content.title}</h1>
								{content.introduction && (
									<p lang={language}>{content.introduction}</p>
								)}
							</div>
						</div>
						<article className="article container">
							{fallback && (
								<p className="language-notice" lang="en">
									{text.fallback}
								</p>
							)}
							<div lang={language}>
								<RichText
									node={content.body.node}
									locale={locale}
									facebook={facebook}
								/>
							</div>
						</article>
					</>
				)}
			</main>
			<Footer locale={locale} />
		</>
	);
}
