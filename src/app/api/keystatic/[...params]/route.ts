import { makeRouteHandler } from "@keystatic/next/route-handler";
import config from "../../../../../keystatic.config";
import { isEditorConfigured, isEditorEnabled } from "@/lib/keystatic";

export const dynamic = "force-dynamic";

type Handler = ReturnType<typeof makeRouteHandler>["GET"];

function handler(method: "GET" | "POST"): Handler {
	return async (...args) => {
		if (!isEditorEnabled()) {
			return Response.json(
				{ error: "Content editing is disabled in this environment." },
				{ status: 403, headers: { "Cache-Control": "no-store" } },
			);
		}
		if (!isEditorConfigured()) {
			return Response.json(
				{ error: "GitHub sign-in is not configured for this deployment." },
				{ status: 503, headers: { "Cache-Control": "no-store" } },
			);
		}
		return makeRouteHandler({ config })[method](...args);
	};
}

export const GET = handler("GET");
export const POST = handler("POST");
