import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/fraunces/600.css";
import "@/app/site.css";
import { copy, type Locale } from "@/lib/locales";

export function Document({
	children,
	locale,
}: {
	children: React.ReactNode;
	locale: Locale;
}) {
	return (
		<html lang={locale}>
			<body>
				<a className="skip-link" href="#main">
					{copy[locale].skip}
				</a>
				{children}
			</body>
		</html>
	);
}
