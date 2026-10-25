"use client";

import { useEffect, useState } from "react";
import {
	ArrowUpRight,
	CalendarDays,
	ChevronDown,
	Clock3,
	MapPin,
	RefreshCw,
} from "lucide-react";
import { copy, type Locale } from "@/lib/locales";
import type { HangoutEvent } from "@/lib/events";

type Feed =
	| { state: "loading" | "error" }
	| { state: "ready"; events: HangoutEvent[] };

export function EventsList({
	locale,
	facebook,
	limit,
}: {
	locale: Locale;
	facebook: string;
	limit?: number;
}) {
	const [feed, setFeed] = useState<Feed>({ state: "loading" });
	const [attempt, setAttempt] = useState(0);
	const text = copy[locale];
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/events", { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error("Calendar unavailable");
				const data = await response.json();
				if (!Array.isArray(data.events)) throw new Error("Invalid calendar");
				if (!controller.signal.aborted)
					setFeed({ state: "ready", events: data.events });
			})
			.catch(() => {
				if (!controller.signal.aborted) setFeed({ state: "error" });
			});
		return () => controller.abort();
	}, [attempt]);

	if (feed.state !== "ready" || feed.events.length === 0) {
		return (
			<div className="event-message" aria-busy={feed.state === "loading"}>
				<CalendarDays size={32} strokeWidth={1.5} aria-hidden="true" />
				<div>
					<p role="status">
						{feed.state === "loading"
							? text.loading
							: feed.state === "error"
								? text.unavailable
								: text.noEvents}
					</p>
					{feed.state !== "loading" && (
						<div className="event-actions">
							<a href={facebook} target="_blank" rel="noopener noreferrer">
								{text.facebookEvents}
								<ArrowUpRight size={17} aria-hidden="true" />
							</a>
							{feed.state === "error" && (
								<button
									type="button"
									className="icon-button"
									aria-label={text.retry}
									title={text.retry}
									onClick={() => {
										setFeed({ state: "loading" });
										setAttempt(attempt + 1);
									}}
								>
									<RefreshCw size={18} aria-hidden="true" />
								</button>
							)}
						</div>
					)}
				</div>
			</div>
		);
	}

	const formatter = locale === "nb" ? "nb-NO" : "en-GB";
	const dateOptions = { timeZone: "Europe/Oslo" };
	return (
		<div className="events-list">
			{feed.events.slice(0, limit).map((event, index) => {
				const start = new Date(event.start);
				const time = start.toLocaleTimeString(formatter, {
					...dateOptions,
					hour: "2-digit",
					minute: "2-digit",
				});
				return (
					<details
						className="event"
						key={`${event.start}-${event.name}-${index}`}
					>
						<summary>
							<time
								className="event-date"
								dateTime={event.start}
								aria-label={start.toLocaleDateString(formatter, {
									...dateOptions,
									dateStyle: "full",
								})}
							>
								<span>
									{start
										.toLocaleDateString(formatter, {
											...dateOptions,
											month: "short",
										})
										.replace(".", "")}
								</span>
								<strong>
									{start.toLocaleDateString(formatter, {
										...dateOptions,
										day: "numeric",
									})}
								</strong>
							</time>
							<span className="event-summary">
								<strong>{event.name}</strong>
								<span className="event-meta">
									{!event.allDay && (
										<span>
											<Clock3 size={15} aria-hidden="true" />
											{time}
											{event.end
												? ` - ${new Date(event.end).toLocaleTimeString(formatter, { ...dateOptions, hour: "2-digit", minute: "2-digit" })}`
												: ""}
										</span>
									)}
									{event.location && (
										<span>
											<MapPin size={15} aria-hidden="true" />
											{event.location}
										</span>
									)}
								</span>
							</span>
							<ChevronDown
								className="event-chevron"
								size={20}
								aria-hidden="true"
							/>
						</summary>
						<div
							className="event-description"
							dangerouslySetInnerHTML={{ __html: event.description }}
						/>
					</details>
				);
			})}
		</div>
	);
}
