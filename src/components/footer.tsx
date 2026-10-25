import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { getSite } from "@/lib/content";
import { copy, localizePath, type Locale } from "@/lib/locales";

export async function Footer({ locale }: { locale: Locale }) {
	const site = await getSite();
	const text = copy[locale];
	return (
		<footer className="site-footer">
			<div className="footer-main container">
				<div>
					<Link href={localizePath("/", locale)} className="footer-brand">
						Queer Hangout<span>.</span>
					</Link>
					<p>{text.footer}</p>
				</div>
				<div className="footer-contact">
					<a href={`mailto:${site.email}`}>
						<Mail size={18} aria-hidden="true" />
						{site.email}
					</a>
					<a
						href={site.facebook ?? "https://www.facebook.com/queerhangout"}
						target="_blank"
						rel="noopener noreferrer"
					>
						Facebook
						<ArrowUpRight size={18} aria-hidden="true" />
					</a>
				</div>
				<div className="footer-donation">
					<span>
						Vipps <strong>{site.vipps}</strong>
					</span>
					<span>
						{locale === "nb" ? "Kontonr." : "Bank account"} {site.bankAccount}
					</span>
				</div>
			</div>
			<div className="footer-bottom container">
				<span>
					© {new Date().getFullYear()} Queer Hangout · Org.nr.{" "}
					{site.organizationNumber}
				</span>
				<div>
					<Link href={localizePath("/personvern", locale)}>{text.privacy}</Link>
					<Link href="/keystatic">{text.editor}</Link>
				</div>
			</div>
			<div className="pride-stripe" aria-hidden="true" />
		</footer>
	);
}
