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
- About us still says twice a month in its opening paragraph, while the homepage and event details describe a monthly meetup. This source inconsistency needs confirmation from the organisers; the migration does not invent a new schedule.
- On 25 October 2026, `https://events.api.queerhangout.no/pages/0.json` failed TLS validation with an expired certificate. The site shows a Facebook link and retry action when the feed is unavailable. TLS validation is not bypassed.
- Markdoc is pinned to the version used by Keystatic to keep their content AST types compatible. Upgrade them together.
- Keystatic stores collection images under `/images/<entry-slug>/`. Imported images were copied into those directories so editing an entry preserves them. Do not replace these with shared root image paths; the reader may display them even when the editor cannot save them.
- `scripts/import-legacy.ts` records the one-time import and refuses to overwrite existing content. Do not rerun it to update editorial content.

Nothing in this repository provisions hosting, creates a GitHub App, changes DNS, or enables a paid plan.
