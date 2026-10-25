import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Queer Hangout | Editor",
	robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
