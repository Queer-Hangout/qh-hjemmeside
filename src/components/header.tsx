"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Globe2, Menu, X } from "lucide-react";
import {
	copy,
	localizePath,
	navigationLabel,
	type Locale,
} from "@/lib/locales";

export function Header({
	locale,
	path,
	navigation,
}: {
	locale: Locale;
	path: string;
	navigation: { path: string; title: string }[];
}) {
	const [open, setOpen] = useState(false);
	const menuToggle = useRef<HTMLButtonElement>(null);
	const text = copy[locale];
	const alternate = localizePath(path, locale === "nb" ? "en" : "nb");
	return (
		<header
			className="site-header"
			onKeyDown={(event) => {
				if (open && event.key === "Escape") {
					event.preventDefault();
					setOpen(false);
					menuToggle.current?.focus();
				}
			}}
		>
			<div className="header-inner">
				<Link
					href={localizePath("/", locale)}
					className="brand"
					aria-label="Queer Hangout"
				>
					<Image
						src="/images/qh-logo.png"
						alt=""
						width={54}
						height={48}
						priority
					/>
					<span>
						Queer
						<br />
						Hangout<span className="brand-dot">.</span>
					</span>
				</Link>
				<nav className="desktop-navigation" aria-label={text.navigation}>
					{navigation.map((item) => (
						<Link
							key={item.path}
							href={localizePath(item.path, locale)}
							aria-current={path === item.path ? "page" : undefined}
						>
							{navigationLabel(item.path, item.title, locale)}
						</Link>
					))}
				</nav>
				<div className="header-actions">
					<a
						href={alternate}
						className="language-switch"
						hrefLang={locale === "nb" ? "en" : "nb"}
						aria-label={text.languageLabel}
					>
						<Globe2 size={17} aria-hidden="true" />
						{text.language}
					</a>
					<button
						ref={menuToggle}
						type="button"
						className="icon-button menu-toggle"
						aria-expanded={open}
						aria-controls="mobile-navigation"
						aria-label={open ? text.closeMenu : text.menu}
						onClick={() => setOpen(!open)}
					>
						{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
					</button>
				</div>
			</div>
			{open && (
				<nav
					id="mobile-navigation"
					className="mobile-navigation"
					aria-label={text.navigation}
				>
					{navigation.map((item) => (
						<Link
							key={item.path}
							href={localizePath(item.path, locale)}
							aria-current={path === item.path ? "page" : undefined}
							onClick={() => setOpen(false)}
						>
							{navigationLabel(item.path, item.title, locale)}
							<ArrowUpRight size={18} aria-hidden="true" />
						</Link>
					))}
				</nav>
			)}
		</header>
	);
}
