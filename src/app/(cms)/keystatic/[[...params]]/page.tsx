import KeystaticApp from "@/components/keystatic-app";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isEditorConfigured, isEditorEnabled } from "@/lib/keystatic";

export const dynamic = "force-dynamic";

export default function Page() {
	if (!isEditorEnabled()) notFound();
	if (!isEditorConfigured()) {
		return (
			<main
				style={{
					padding: "48px",
					maxWidth: "640px",
					margin: "auto",
					fontFamily: "sans-serif",
				}}
			>
				<h1>Editor unavailable</h1>
				<p>GitHub sign-in is not configured for this deployment.</p>
				<Link href="/">Back to Queer Hangout</Link>
			</main>
		);
	}
	return <KeystaticApp />;
}
