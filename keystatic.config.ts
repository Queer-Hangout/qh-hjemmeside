import { collection, config, fields, singleton } from "@keystatic/core";
import { block } from "@keystatic/core/content-components";

const translation = (label: string) =>
	fields.object(
		{
			title: fields.text({ label: "Title" }),
			description: fields.text({
				label: "Search description",
				multiline: true,
			}),
			introduction: fields.text({ label: "Introduction", multiline: true }),
			body: fields.markdoc.inline({
				label: "Content",
				options: {
					image: { directory: "public/images", publicPath: "/images/" },
				},
				components: { events: block({ label: "Upcoming events", schema: {} }) },
			}),
		},
		{ label },
	);

export default config({
	storage:
		process.env.NODE_ENV === "development" &&
		process.env.NEXT_PUBLIC_KEYSTATIC_GITHUB_MODE !== "true"
			? { kind: "local" }
			: { kind: "github", repo: "Queer-Hangout/qh-hjemmeside" },
	ui: { brand: { name: "Queer Hangout" } },
	singletons: {
		site: singleton({
			label: "Contact and site settings",
			path: "content/site",
			format: { data: "json" },
			schema: {
				email: fields.text({
					label: "Contact email",
					validation: { isRequired: true },
				}),
				facebook: fields.url({ label: "Facebook URL" }),
				vipps: fields.text({ label: "Vipps number" }),
				bankAccount: fields.text({ label: "Bank account" }),
				organizationNumber: fields.text({ label: "Organization number" }),
			},
		}),
	},
	collections: {
		pages: collection({
			label: "Pages / Sider",
			slugField: "name",
			path: "content/pages/*",
			format: { data: "json" },
			schema: {
				name: fields.slug({ name: { label: "Internal page name" } }),
				urlPath: fields.text({
					label: "URL path",
					validation: { isRequired: true },
				}),
				published: fields.checkbox({ label: "Published", defaultValue: true }),
				menuOrder: fields.integer({
					label: "Menu order (-1 to hide)",
					defaultValue: -1,
				}),
				template: fields.select({
					label: "Page layout",
					options: [
						{ label: "Standard page", value: "page" },
						{ label: "Homepage", value: "home" },
						{ label: "Events", value: "events" },
					],
					defaultValue: "page",
				}),
				heroImage: fields.image({
					label: "Cover photo",
					directory: "public/images",
					publicPath: "/images/",
				}),
				heroAlt: fields.object(
					{
						nb: fields.text({ label: "Norwegian alt text" }),
						en: fields.text({ label: "English alt text" }),
					},
					{ label: "Cover photo description" },
				),
				photoCredit: fields.text({ label: "Photographer / credit" }),
				nb: translation("Norsk bokmal"),
				en: translation("English"),
			},
		}),
	},
});
