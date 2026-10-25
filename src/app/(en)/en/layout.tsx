import { Document } from "@/components/document";

export default function Layout({ children }: { children: React.ReactNode }) {
	return <Document locale="en">{children}</Document>;
}
