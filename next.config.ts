import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	poweredByHeader: false,
	images: { unoptimized: true },
	outputFileTracingIncludes: { "/*": ["./content/**/*"] },
	async redirects() {
		return [
			{ source: "/english", destination: "/en", permanent: true },
			{
				source: "/innsamling",
				destination: "/skeiv-dag/innsamling",
				permanent: true,
			},
			{
				source: "/en/innsamling",
				destination: "/en/skeiv-dag/innsamling",
				permanent: true,
			},
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
