# Queer Hangout

The Queer Hangout website, built with Next.js, TypeScript, and the Keystatic editor. Content and photos live in GitHub; there is no database or separate CMS server.

## Run locally

Use Node.js 24 LTS and npm. The project uses the public npm registry.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000 and http://127.0.0.1:3000/keystatic. Next.js selects another port if 3000 is occupied. The local editor writes to files in this checkout. It is bound to loopback; do not expose the development server to the internet.

## Content

Each page has Norwegian and English fields in the same entry. English content is organised on the same pages as Norwegian content, with translations for all migrated pages. Switching languages preserves the current page. New pages without an English title and body show the Norwegian content with a language notice. Existing URLs are preserved; `/english` redirects to `/en`.

The editor manages page content, photos, photo credits, menu order, visibility, and contact details. Use the `Upcoming events` content block to include the external calendar. `Published` controls visibility on the website, not access to files in GitHub. Drafts in a public repository are public too.

Keep page URLs unique. `/en`, `/api`, `/keystatic`, and `/english` are reserved. A negative menu order hides a page from navigation without unpublishing it. The homepage uses `/`.

Images are stored under `public/images`. Resize large uploads before adding them; originals are served directly to avoid using a paid image service. Fonts are bundled locally. There is no analytics tracker or cookie banner.

## Vercel and GitHub sign-in

1. Connect this repository to the existing Vercel project using the Next.js preset and `main` as the production branch. Use Node.js 24, `npm ci`, and `npm run build`. Keep within the existing free-plan limits; no paid add-ons are required.
2. For the one-time GitHub App setup, add `NEXT_PUBLIC_KEYSTATIC_GITHUB_MODE=true` to a local `.env.local` file and restart the development server. Open `/keystatic` and follow Keystatic's GitHub setup. Install the generated GitHub App only on `Queer-Hangout/qh-hjemmeside`. An organization owner may need to approve it.
3. Add the production callback URL to that GitHub App: `https://queerhangout.no/api/keystatic/github/oauth/callback`. Use the actual deployment hostname if testing before the domain moves. Only add callback URLs for trusted deployments.
4. Put the generated credentials below into Vercel's environment settings, not GitHub. Set the public app slug too, then redeploy. Remove the local GitHub-mode override to return to file-based editing on your laptop.
5. Editors sign in with GitHub and need write access to the repository. Saving to `main` triggers the Vercel deployment. Changes are public after that build succeeds. Changes on another branch need merging first.

Production always uses GitHub storage, never local disk. Without credentials, the public website builds and works, but the editor reports that sign-in is not configured and its API returns 503. GitHub login cannot be verified until a GitHub App is installed and these variables are supplied.

| Variable                                | Purpose                                                           | Required        |
| --------------------------------------- | ----------------------------------------------------------------- | --------------- |
| `NEXT_PUBLIC_SITE_URL`                  | Canonical domain; defaults to `https://queerhangout.no`           | No              |
| `NEXT_PUBLIC_KEYSTATIC_GITHUB_MODE`     | Enable GitHub App setup in local development; defaults to `false` | No              |
| `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | Generated GitHub App's slug, not its numeric ID                   | Deployed editor |
| `KEYSTATIC_GITHUB_CLIENT_ID`            | Generated GitHub App's client ID                                  | Deployed editor |
| `KEYSTATIC_GITHUB_CLIENT_SECRET`        | Generated GitHub App's client secret                              | Deployed editor |
| `KEYSTATIC_SECRET`                      | Generated Keystatic authentication secret                         | Deployed editor |

See `.env.example` and the [Keystatic GitHub guide](https://keystatic.com/docs/github-mode). Never prefix a secret with `NEXT_PUBLIC_`. Do not enable secrets for untrusted pull-request previews.

## Calendar without AWS

Set `CALENDAR_ICS_URL` in the ignored local environment and in Vercel's server-side environment settings. Use your dedicated public-event calendar's ICS subscription URL. Do not use a personal calendar or expose a subscription URL containing a token in client code or Git. The calendar API, notification script, hourly workflow, and delivery state all belong to this repository; the retired calendar repository is not needed at runtime.

The existing `/api/events` endpoint now reads that source directly. It uses `node-ical` for recurrences, moved instances, exclusions, and timezones, and returns the same event shape the website already uses. The source and successful responses are cached for five minutes; refreshes are not immediate. Private/confidential and cancelled events are excluded. The query window is 180 days, and December exclusions must be recorded in the source calendar, not inferred from website text. Timed entries should specify a timezone such as `Europe/Oslo`.

The calendar URL is server-only, HTTPS is required, and download/expansion limits bound resource use. Invalid feeds return an unavailable response, not an empty list. The website needs no Discord credentials, database, S3 bucket, separate domain, or cron job.

The same parser powers a dry-run-first notification command:

```sh
npm run calendar:check
```

This loads the ignored local environment, fetches the calendar, and prints counts only. It does not send messages or write notification state. Live sending requires an explicit `--send`, `DISCORD_WEBHOOK_URL`, and a persistent `--state` path. `--baseline --send` replaces state quietly after an intentional source change. `DISCORD_MENTION_HERE=true` enables an intentional `@here` only for reminders; the default is no pings.

### Hourly Discord notifications

The workflow is `.github/workflows/calendar-notify.yml`. It checks out this repository once and runs at minute 17 every hour on a standard GitHub-hosted Linux runner. Standard runners are free for this public repository; no paid runner or artifact service is used.

In this repository's Settings > Secrets and variables > Actions, configure:

| Kind     | Name                             | Value                                                        |
| -------- | -------------------------------- | ------------------------------------------------------------ |
| Secret   | `CALENDAR_ICS_URL`               | Dedicated public-event ICS subscription URL                  |
| Secret   | `DISCORD_WEBHOOK_URL`            | Webhook for the destination Discord channel                  |
| Variable | `CALENDAR_NOTIFICATIONS_ENABLED` | Leave unset or `false` until cutover; `true` enables sending |
| Variable | `CALENDAR_SITE_URL`              | Website origin; defaults to `https://queerhangout.no`        |
| Variable | `DISCORD_MENTION_HERE`           | Optional `true` for reminder pings; defaults to `false`      |

The workflow commits `state/notifications.json` on this repository's default branch. Repository and organisation permissions, including branch protection, must allow those state updates. Only schedules and manual runs on the default branch can run; pull requests never receive these secrets.

### State-only commits and Vercel

`vercel.json` runs `scripts/ignore-state-build.mjs` as the Ignored Build Step. It skips a build only when the changes since Vercel's last successful deployment are limited to `state/notifications.json`. Source, content, configuration, and mixed commits still build. First deployments, redeployments without source changes, and unavailable Git history also build rather than risk missing an application change.

Keep **Enable access to System Environment Variables** enabled in Vercel. The guard uses `VERCEL_GIT_PREVIOUS_SHA`, which Vercel supplies for an Ignored Build Step, and `VERCEL_GIT_COMMIT_SHA`. It needs only Node.js and Git, so it works before dependencies are installed. The workflow's `[skip ci]` commit marker is not relied upon to skip Vercel builds.

### Cut over safely

1. Commit and push this repository. Nothing sends while `CALENDAR_NOTIFICATIONS_ENABLED` is unset or `false`.
2. Add `CALENDAR_ICS_URL` to Vercel and deploy. Compare upcoming dates with the source calendar, including cancellations and recurring exceptions.
3. Add the two GitHub secrets here. Run **Calendar notifications** manually with `dry_run` checked and inspect its counts. This works while notifications are disabled.
4. Once verified, pause the old AWS Discord notification path before enabling the replacement, to avoid duplicate announcements. AWS has not been changed by this migration.
5. Set `CALENDAR_NOTIFICATIONS_ENABLED=true` and run manually with `dry_run` unchecked. The first successful run creates a quiet baseline without announcing existing events. Later runs announce new, changed, and cancelled series, and send day-before reminders after 09:00 Europe/Oslo.
6. Verify delivery before decommissioning AWS separately. Check other consumers of the old endpoint. Archiving the old repository does not stop its AWS resources.

### State and reliability

The first successful sending-mode run creates `state/notifications.json`. It is tracked in Git, not stored only on an ephemeral runner or in an expiring cache. Other files under `state/`, including temporary write files, are ignored. State contains public event summaries, hashed identifiers, delivery checkpoints, and the last successful check time, never the subscription URL or webhook token. Use a dedicated public-event calendar because repository contents are public.

The first run is quiet. New, edited, and cancelled series with upcoming events produce one announcement per series. Day-before reminders refer to individual occurrences. Each successful delivery is checkpointed, and completed work is committed even if a later message fails. Corrupt state and a changed source URL fail closed. After reviewing an intentional source change, use the manual `reset_baseline` option with sending enabled to establish a quiet baseline; do not delete state to retry a failed job.

Delivery is best-effort, not exactly once. A crash between Discord accepting a message and the state commit, or a failed Git push, can cause a duplicate on retry. HTTP failures and rate limits leave pending work for the next run. Failed downloads and invalid calendars do not trigger cancellation notices. Checks are hourly, not instant, and a day-before reminder is not recovered after that day has passed.

GitHub can delay or drop scheduled runs and disables public-repository schedules after 60 days without repository activity. Successful checks record their timestamp in Git, but this is not a delivery guarantee. Monitor failed workflows and the last successful check, enable failure notifications, and keep a manual reminder option. This is not suitable for time-critical alerts.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The tests cover bilingual content reading, migration, internal links, media references, event filtering, and HTML sanitization. The public pages are generated from the checked-in content; production content changes require a successful deployment. Take periodic repository backups, including photos. Git history helps recover editorial mistakes but is not an independent backup.

Browser checks start an isolated production build on port 3100 and a local-mode editor on port 3101. They use separate build directories under `.next`, explicitly clear GitHub credentials in the test processes, and leave your normal preview on port 3000 alone. They create and remove isolated test entries, never save to GitHub, and save screenshots under the ignored `test-results` folder. `NEXT_TEST_DIST_DIR` selects the isolated build directory; leave it unset outside browser tests.

```sh
npx playwright install chromium
npm run test:browser
```

## Migration notes

- The old repository is unchanged. The initial migration split the English summary across the matching bilingual entries. The later content update from `EnLitenDompap-haapcafe` at `3672b43675fcb226e8eb6b23ecc55dd3c366e087` leaves six public entries.
- Håp Cafe replaces Kometen as the meeting venue, with meetings on the last Sunday of the month, 14:00-16:00, except December. The new cafe photo uses entry-specific paths so editor saves preserve it.
- The English "New in Norway" resources are on About us. The importer accepts both "Activities" and "Events" headings and appends newcomer resources without replacing the About text.
- The goals, Skeiv Dag, and fundraising pages were retired as in the source branch. Their old Norwegian and English URLs redirect to About us, which retains the historical information. The homepage donation panel was removed. Existing footer payment details remain because the source branch does not change them.
- Source copy, photo descriptions, and credits were preserved. The privacy page was rewritten because this version does not include the old Google Analytics integration. Review it before launch.
- On 25 October 2026, the old AWS calendar endpoint failed TLS validation. The original ICS source worked and is now read directly; no certificate validation is bypassed. The Facebook link and retry action remain available when the source cannot be read.
- Markdoc is pinned to the version used by Keystatic to keep their content AST types compatible. Upgrade them together.
- Keystatic stores collection images under `/images/<entry-slug>/`. Imported images were copied into those directories so editing an entry preserves them. Do not replace these with shared root image paths; the reader may display them even when the editor cannot save them.
- `scripts/import-legacy.ts` records the one-time import and refuses to overwrite existing content. Do not rerun it to update editorial content.

Nothing in this repository provisions hosting, creates a GitHub App, changes DNS, or enables a paid plan.
