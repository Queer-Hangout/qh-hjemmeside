import { normalizeEvents } from "@/lib/events";

export async function GET() {
	try {
		const response = await fetch(
			"https://events.api.queerhangout.no/pages/0.json",
			{
				signal: AbortSignal.timeout(8000),
				cache: "no-store",
			},
		);
		if (!response.ok) throw new Error(`Event feed returned ${response.status}`);
		const events = normalizeEvents(await response.json());
		return Response.json(
			{ events },
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
				},
			},
		);
	} catch {
		return Response.json(
			{ error: "events_unavailable" },
			{
				status: 503,
				headers: { "Cache-Control": "no-store" },
			},
		);
	}
}
