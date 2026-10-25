import React from "react";
import Markdoc, { type Node } from "@markdoc/markdoc";
import Image from "next/image";
import { EventsList } from "./events-list";
import { localizePath, type Locale } from "@/lib/locales";

export function safeHref(href: string): string {
	if (/^(?:https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(href)) return href;
	return "#";
}

export function RichText({
	node,
	locale,
	facebook,
}: {
	node: Node;
	locale: Locale;
	facebook: string;
}) {
	const tree = Markdoc.transform(node, {
		nodes: {
			image: { ...Markdoc.nodes.image, render: "ContentImage" },
			link: { ...Markdoc.nodes.link, render: "ContentLink" },
		},
		tags: { events: { render: "Events", selfClosing: true } },
	});
	return (
		<div className="prose">
			{Markdoc.renderers.react(tree, React, {
				components: {
					ContentImage: ({
						src,
						alt,
						title,
					}: {
						src: string;
						alt?: string;
						title?: string;
					}) => (
						<span
							className="content-image"
							role="figure"
							aria-label={title || alt}
						>
							<Image
								src={src.startsWith("/images/") ? src : "/images/qh-logo.png"}
								alt={alt ?? ""}
								width={1200}
								height={900}
								sizes="(max-width: 800px) 100vw, 800px"
							/>
							{title && <span className="photo-caption">{title}</span>}
						</span>
					),
					ContentLink: ({
						href,
						children,
					}: {
						href: string;
						children: React.ReactNode;
					}) => <a href={safeHref(localizePath(href, locale))}>{children}</a>,
					Events: () => <EventsList locale={locale} facebook={facebook} />,
				},
			})}
		</div>
	);
}
