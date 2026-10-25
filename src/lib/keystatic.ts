export function isEditorEnabled(
	environment: Record<string, string | undefined> = process.env,
) {
	if (
		environment.VERCEL ||
		environment.VERCEL_ENV ||
		environment.VERCEL_TARGET_ENV
	) {
		return (
			environment.NODE_ENV === "production" &&
			environment.VERCEL_ENV === "production" &&
			(!environment.VERCEL_TARGET_ENV ||
				environment.VERCEL_TARGET_ENV === "production")
		);
	}
	return environment.NODE_ENV === "development";
}

export function isEditorConfigured(
	environment: Record<string, string | undefined> = process.env,
) {
	return (
		isEditorEnabled(environment) &&
		(environment.NODE_ENV === "development" ||
			Boolean(
				environment.KEYSTATIC_GITHUB_CLIENT_ID &&
				environment.KEYSTATIC_GITHUB_CLIENT_SECRET &&
				environment.KEYSTATIC_SECRET &&
				environment.NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG,
			))
	);
}
