import { fetchCalendarSource, parseCalendar } from "@/lib/calendar";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
	try {
		const url = process.env.CALENDAR_ICS_URL;
		if (!url) throw new Error("Calendar source is not configured");
		const source = await fetchCalendarSource(url, (input, options) =>
			fetch(input, { ...options, next: { revalidate: 300 } }),
		);
		const { events } = await parseCalendar(source);
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
