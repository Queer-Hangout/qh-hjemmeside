import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	distDir: process.env.NEXT_TEST_DIST_DIR || ".next",
	poweredByHeader: false,
	images: { unoptimized: true },
	outputFileTracingIncludes: { "/*": ["./content/**/*"] },
	async redirects() {
		return [
			{ source: "/english", destination: "/en", permanent: true },
			{ source: "/hvaskjer", destination: "/hva-skjer", permanent: true },
			{ source: "/en/hvaskjer", destination: "/en/hva-skjer", permanent: true },
			...[
				"/innsamling",
				"/skeiv-dag/innsamling",
				"/skeiv-dag",
				"/vaare-maal",
			].flatMap((source) => [
				{ source, destination: "/om-oss", permanent: true },
				{ source: `/en${source}`, destination: "/en/om-oss", permanent: true },
			]),
		];
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{ key: "X-Frame-Options", value: "SAMEORIGIN" },
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
				],
			},
		];
	},
};

export default nextConfig;
