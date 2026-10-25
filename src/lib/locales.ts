export type Locale = "nb" | "en";

export function localizePath(path: string, locale: Locale): string {
	if (!path.startsWith("/") || path.startsWith("//")) return path;
	const canonical = path === "/innsamling" ? "/skeiv-dag/innsamling" : path;
	if (canonical === "/english") return "/en";
	if (locale === "nb" || /^\/en(?:\/|$|#|\?)/.test(canonical)) return canonical;
	return `/en${canonical === "/" ? "" : canonical}`;
}

export function resolveRoute(segments: string[] = []): {
	locale: Locale;
	path: string;
} {
	const english = segments[0] === "en";
	return {
		locale: english ? "en" : "nb",
		path: `/${(english ? segments.slice(1) : segments).join("/")}`,
	};
}

export const copy = {
	nb: {
		skip: "Hopp til innhold",
		navigation: "Hovedmeny",
		menu: "Åpne meny",
		closeMenu: "Lukk meny",
		home: "Hjem",
		events: "Hva skjer?",
		about: "Om oss",
		goals: "Våre mål",
		rules: "Regler",
		contact: "Kontakt",
		privacy: "Personvern",
		editor: "Rediger nettsiden",
		language: "English",
		languageLabel: "Read in English",
		place: "Drammen og omegn",
		community: "Et sted å høre til.",
		nextEvents: "Neste gang vi møtes",
		allEvents: "Se alle arrangementer",
		eventsIntro: "En prat, en kaffe eller noe helt annet. Vi møtes i Drammen.",
		loading: "Henter arrangementer",
		noEvents: "Ingen kommende arrangementer i kalenderen akkurat nå.",
		unavailable: "Vi får ikke hentet kalenderen akkurat nå.",
		facebookEvents: "Se siste nytt på Facebook",
		retry: "Prøv igjen",
		more: "Les mer",
		welcome: "Du er velkommen.",
		welcomeBody: "Skeiv, usikker eller utforskende. Her er det plass til deg.",
		sober: "En rusfri møteplass",
		soberBody:
			"Vi møtes uten alkohol. Ta gjerne med en venn eller assistent som støtte.",
		access: "Tilrettelegging",
		accessBody:
			"Har du behov for tilrettelegging? Ta kontakt, så finner vi ut av det sammen.",
		support: "Små bidrag. Mer fellesskap.",
		supportBody:
			"Queer Hangout drives på dugnad. Din støtte hjelper oss å skape flere møteplasser.",
		supportLink: "Les om våre mål",
		footer: "En sosial møteplass for skeive voksne i Drammen.",
		fallback: "Denne siden er foreløpig bare tilgjengelig på norsk.",
		back: "Til forsiden",
		notFound: "Denne siden finnes ikke.",
		notFoundBody: "Adressen kan være feil, eller siden kan ha blitt flyttet.",
	},
	en: {
		skip: "Skip to content",
		navigation: "Main navigation",
		menu: "Open menu",
		closeMenu: "Close menu",
		home: "Home",
		events: "What’s on?",
		about: "About us",
		goals: "Our goals",
		rules: "Guidelines",
		contact: "Contact",
		privacy: "Privacy",
		editor: "Edit website",
		language: "Norsk",
		languageLabel: "Les på norsk",
		place: "Drammen and nearby",
		community: "A place to belong.",
		nextEvents: "The next time we meet",
		allEvents: "See all events",
		eventsIntro:
			"A chat, a coffee, or something else entirely. Find us in Drammen.",
		loading: "Loading events",
		noEvents: "There are no upcoming events in the calendar right now.",
		unavailable: "We can’t load the calendar right now.",
		facebookEvents: "Find the latest on Facebook",
		retry: "Try again",
		more: "Read more",
		welcome: "You are welcome.",
		welcomeBody:
			"Queer, questioning, or exploring. There is a place for you here.",
		sober: "An alcohol-free space",
		soberBody:
			"We meet without alcohol. You are welcome to bring a friend or assistant for support.",
		access: "Accessibility",
		accessBody:
			"Need an accommodation? Get in touch so we can work it out together.",
		support: "Small contributions. More community.",
		supportBody:
			"Queer Hangout is run by volunteers. Your support helps us create more places to meet.",
		supportLink: "Read about our goals",
		footer: "A community for queer adults in Drammen.",
		fallback: "This page is currently available in Norwegian only.",
		back: "Back to home",
		notFound: "This page doesn’t exist.",
		notFoundBody: "The address may be incorrect, or the page may have moved.",
	},
} as const;

export function navigationLabel(
	path: string,
	title: string,
	locale: Locale,
): string {
	const labels: Record<string, string> = {
		"/": copy[locale].home,
		"/om-oss": copy[locale].about,
		"/hva-skjer": copy[locale].events,
		"/vaare-maal": copy[locale].goals,
		"/regler": copy[locale].rules,
		"/kontakt-oss": copy[locale].contact,
		"/skeiv-dag": "Skeiv dag",
	};
	return labels[path] ?? title;
}
