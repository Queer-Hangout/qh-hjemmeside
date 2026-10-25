import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkStringify from "remark-stringify";
import type { Root } from "mdast";

type LegacyNode = {
	type: string;
	name?: string;
	value?: string;
	url?: string;
	depth?: number;
	children?: LegacyNode[];
	attributes?: { name?: string; value?: unknown }[];
	alt?: string;
	title?: string | null;
};

const parser = unified().use(remarkParse).use(remarkMdx);
const printer = unified().use(remarkStringify, {
	bullet: "-",
	emphasis: "*",
	fences: true,
});

export function convertLegacy(markdown: string) {
	const root = parser.parse(markdown) as unknown as LegacyNode;
	const headingIndex =
		root.children?.findIndex(
			(node) => node.type === "heading" && node.depth === 1,
		) ?? -1;
	if (headingIndex >= 0) root.children!.splice(headingIndex, 1);
	function convert(node: LegacyNode): LegacyNode[] {
		if (node.type === "mdxjsEsm") return [];
		if (node.type === "image" && node.url?.startsWith("../images/"))
			node.url = `/images/${basename(node.url)}`;
		if (node.type === "link" && node.url === "/innsamling")
			node.url = "/skeiv-dag/innsamling";
		if (node.type === "heading" && node.depth === 1) node.depth = 2;
		if (node.children) node.children = node.children.flatMap(convert);
		if (
			node.type === "mdxJsxFlowElement" ||
			node.type === "mdxJsxTextElement"
		) {
			if (node.name === "EventsList")
				return [{ type: "html", value: "{% events /%}" }];
			if (node.name === "a" || node.name === "Link") {
				const href = node.attributes?.find(
					(attribute) => attribute.name === "href" || attribute.name === "to",
				)?.value;
				if (typeof href !== "string")
					throw new Error("Unsupported legacy link");
				const url = href === "skeivverden.no" ? "https://skeivverden.no" : href;
				return [{ type: "link", url, children: node.children ?? [] }];
			}
			if (node.name === "br") return [{ type: "break" }];
			throw new Error(`Unsupported legacy component: ${node.name}`);
		}
		return [node];
	}
	return printer.stringify({
		...root,
		children: root.children?.flatMap(convert),
	} as Root);
}

export function splitEnglishSummary(markdown: string): Record<string, string> {
	const root = unified().use(remarkParse).parse(markdown);
	const routes: Record<string, string> = {
		"About us": "/om-oss",
		Activities: "/hva-skjer",
		Rules: "/regler",
		"Contact information": "/kontakt-oss",
	};
	const sections: Record<string, Root> = {};
	let path: string | undefined;
	for (const node of root.children) {
		if (node.type === "heading" && node.depth === 2) {
			const title = node.children
				.map((child) => ("value" in child ? child.value : ""))
				.join("");
			path = routes[title];
			if (!path) throw new Error(`Unmapped English section: ${title}`);
			sections[path] = { type: "root", children: [] };
		} else if (path) {
			if (node.type === "heading" && node.depth > 2) {
				node.depth = (node.depth - 1) as typeof node.depth;
			}
			sections[path].children.push(node);
		}
	}
	for (const route of Object.values(routes)) {
		if (!sections[route]?.children.length) {
			throw new Error(`Missing English section for ${route}`);
		}
	}
	sections["/"] = {
		type: "root",
		children: sections["/om-oss"].children
			.filter((node) => node.type === "paragraph")
			.slice(0, 1),
	};
	return Object.fromEntries(
		Object.entries(sections).map(([route, section]) => [
			route,
			printer.stringify(section),
		]),
	);
}

type PageAssets = {
	heroImage: string | null;
	nb: { body: string };
	en: { body: string };
};

export async function rebasePageAssets<PageRecord extends PageAssets>(
	slug: string,
	page: PageRecord,
	sourceImages: string,
): Promise<PageRecord> {
	const result = structuredClone(page);
	const images = new Map<string, string>();
	for (const language of ["nb", "en"] as const) {
		const root = unified()
			.use(remarkParse)
			.parse(result[language].body) as unknown as LegacyNode;
		function rewrite(node: LegacyNode) {
			if (node.type === "image" && node.url?.startsWith("/images/")) {
				const filename = basename(node.url);
				images.set(filename, filename);
				node.url = `/images/${slug}/${filename}`;
			}
			node.children?.forEach(rewrite);
		}
		rewrite(root);
		result[language].body = printer.stringify(root as Root);
	}
	if (result.heroImage) {
		const filename = basename(result.heroImage);
		const target = `heroImage${extname(filename)}`;
		images.set(target, filename);
		result.heroImage = `/images/${slug}/${target}`;
	}
	const directory = join("public/images", slug);
	await mkdir(directory, { recursive: true });
	for (const [target, source] of images) {
		await cp(join(sourceImages, source), join(directory, target), {
			force: false,
			errorOnExist: true,
		});
	}
	return result;
}

async function main() {
	const source = resolve(process.argv[2] ?? "../queer-hangout-hjemmeside");
	const target = resolve("content/pages");
	await mkdir(target, { recursive: true });
	if ((await readdir(target)).length)
		throw new Error("Content already exists. Import refuses to overwrite it.");
	const english = matter(
		await readFile(join(source, "content/pages/english.mdx"), "utf8"),
	);
	const englishSections = splitEnglishSummary(convertLegacy(english.content));
	const englishTitles: Record<string, string> = {
		"/": "Home",
		"/om-oss": "About us",
		"/hva-skjer": "What's on?",
		"/regler": "Guidelines",
		"/kontakt-oss": "Contact us",
	};
	const files = (await readdir(join(source, "content/pages"))).filter(
		(file) => file.endsWith(".mdx") && file !== "english.mdx",
	);
	for (const filename of files) {
		const { data, content } = matter(
			await readFile(join(source, "content/pages", filename), "utf8"),
		);
		const path = String(data.slug);
		const home = path === "/";
		const slug = home ? "home" : path.slice(1).replaceAll("/", "--");
		const heading = (
			parser.parse(content) as unknown as LegacyNode
		).children?.find((node) => node.type === "heading" && node.depth === 1);
		const headingText = heading?.children
			?.map((node) => node.value ?? "")
			.join("");
		const displayTitle =
			headingText &&
			headingText.toLowerCase() !== String(data.title).toLowerCase()
				? headingText
				: data.title;
		const blank = { title: "", description: "", introduction: "", body: "" };
		const page = {
			name: data.title,
			urlPath: path,
			published: true,
			menuOrder: data.menu,
			template: home ? "home" : path === "/hva-skjer" ? "events" : "page",
			heroImage: home ? "/images/skeivdag1.jpg" : null,
			heroAlt: {
				nb: home
					? "Folk fra Queer Hangout sammen på regnbuegata i Drammen under Skeiv Dag."
					: "",
				en: home
					? "Queer Hangout together on the rainbow street in Drammen during Skeiv Dag."
					: "",
			},
			photoCredit: home ? "Skeiv Dag 2024. Ukjent fotograf." : "",
			nb: {
				title: home ? data.title : displayTitle,
				description: data.description,
				introduction: home
					? "En sosial møteplass for skeive voksne i Drammen."
					: "",
				body: convertLegacy(content),
			},
			en: englishSections[path]
				? {
						title: englishTitles[path],
						description: english.data.description,
						introduction: home
							? "A community for queer adults in Drammen."
							: "",
						body: englishSections[path],
					}
				: blank,
		};
		const normalized = await rebasePageAssets(
			slug,
			page,
			join(source, "content/images"),
		);
		await writeFile(
			join(target, `${slug}.json`),
			`${JSON.stringify(normalized, null, 2)}\n`,
		);
	}
	await mkdir("public/images", { recursive: true });
	for (const image of await readdir(join(source, "content/images"))) {
		await cp(
			join(source, "content/images", image),
			join("public/images", image),
			{ force: false, errorOnExist: true },
		);
	}
	await cp(join(source, "content/images/qh-logo.png"), "public/icon.png", {
		force: false,
		errorOnExist: true,
	});
	console.log(
		`Imported ${files.length} page entries and original images. English sections assigned to matching pages.`,
	);
}

if (process.argv[1]?.endsWith("import-legacy.ts")) await main();
