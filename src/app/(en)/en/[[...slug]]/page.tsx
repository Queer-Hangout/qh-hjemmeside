import {
	SitePage,
	pageMetadata,
	staticPaths,
	type PageProps,
} from "@/components/site-page";

export const generateStaticParams = staticPaths;
export const generateMetadata = (props: PageProps) => pageMetadata(props, "en");

export default function Page(props: PageProps) {
	return <SitePage props={props} locale="en" />;
}
