import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { copy, localizePath, type Locale } from "@/lib/locales";

export function MissingPage({ locale }: { locale: Locale }) {
	const text = copy[locale];
	return (
		<main id="main" className="missing-page container">
			<span className="eyebrow">Queer Hangout / 404</span>
			<h1>{text.notFound}</h1>
			<p>{text.notFoundBody}</p>
			<Link className="button button-green" href={localizePath("/", locale)}>
				<ArrowLeft size={18} aria-hidden="true" />
				{text.back}
			</Link>
		</main>
	);
}
