# Web Authenticated Demo And QA Runbook

Use this runbook for a local Web-only demo pass with real Supabase authentication.
Do not paste secrets, passwords, tokens, cookies, session values, provider keys, or `.env` contents into docs, commits, screenshots, issue comments, or demo notes.

## What This Covers

- `pnpm smoke:web`: credential-free public/auth-gate smoke checks.
- `pnpm check:web-env`: non-secret readiness check for real authenticated QA.
- Manual authenticated QA: requires local Supabase env names and a test account you create yourself.
- Demo data preparation: manual app-first steps, no committed credentials and no service-role key.

## Required Local Environment

Create `apps/web/.env.local` locally, but do not commit it and do not paste values into reports.

Required for real authenticated Web QA:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Recommended for stable local routes and callbacks:

```text
NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_SITE_URL
```

Optional for AI-assisted demo features:

```text
LLM_API_BASE_URL
LLM_API_KEY
LLM_MODEL_NAME
```

Optional for internal/admin diagnostics:

```text
WEB_ADMIN_EMAILS
WEB_INTERNAL_ROUTES
ENABLE_INTERNAL_DASHBOARDS
INTERNAL_API_SECRET
```

Notes:

- `WEB_INTERNAL_ROUTES` is the current local-dev flag used by the Web proxy.
- `WEB_ADMIN_EMAILS` is the current admin allowlist used by the Web proxy.
- `ENABLE_INTERNAL_DASHBOARDS` and `INTERNAL_API_SECRET` are not required for the current Web QA flow.
- Leave internal/admin variables unset unless intentionally testing gated diagnostics.

Run the non-secret verifier:

```bash
pnpm check:web-env
```

Expected behavior:

- It prints variable names and whether each is present.
- It never prints actual values.
- It exits non-zero only when required Supabase public env names are missing.

## Start Web

From the repository root:

```bash
pnpm install
pnpm dev:web
```

In another terminal:

```bash
pnpm smoke:web
pnpm qa:web-auth
```

`pnpm smoke:web` must remain credential-free. It checks public pages, protected-route redirects, internal route gating, and sanitized protected API responses.

`pnpm qa:web-auth` prints a manual checklist. It does not log in, read credentials, or contact Supabase.

## Test User Safety

- Create or use dedicated test users only.
- Use the app sign-up/login flow or the Supabase Auth dashboard.
- Do not hardcode or commit email addresses, passwords, magic links, cookies, or session tokens.
- If email confirmation is enabled, complete it through your local test mailbox or Supabase dashboard.
- Use a private browser profile or clear browser storage between logged-in and logged-out checks.
- Prefer two test users for social/DM checks: user A for posting and user B for replies/follows/messages.

## Demo Data Preparation

Prepare data through the app whenever possible.

Minimum single-user pass:

1. Sign in as user A.
2. Open `/settings/profile` and set display name, handle, and a short bio.
3. Open `/compose`.
4. Create 3-5 posts with varied topics and tones.
5. Open each post from the success links or `/home`.
6. Save/bookmark at least one post.
7. Open `/dashboard/persona`, `/persona-feed`, `/persona-evolution`, and `/persona-lab`.

Recommended two-user pass:

1. Sign in as user A and create 3-5 posts.
2. Sign out or use a separate browser profile.
3. Sign in as user B and create 1-2 posts.
4. From user B, find one user A post through `/search`, `/trending`, `/home`, or a profile page.
5. Reply to user A's post.
6. Follow user A if the follow button is shown.
7. Save one user A post.
8. Open `/messages`; if a conversation exists, send one message and reload the thread.
9. Return to user A and check notifications, saved posts, and profile pages.

Optional SQL guidance:

- Do not add or run SQL just to make the basic demo work.
- Fresh Supabase projects must include `supabase/migrations/20260222130000_core_social_schema.sql` before `20260222140000_saved_post_collections.sql` and later saved/bookmark/persona-growth migrations.
- Existing optional SQL docs under `docs/sql/` describe persona assignment, persona feed learning, saved collections, push metrics, and post open state.
- Run optional SQL only in a local/dev Supabase project after reviewing it.
- Do not use a service-role key for this runbook unless you have a separate local-only reason and a safe secret-handling process.

## Core Authenticated Flow

Sign in:

- Open `/login`.
- Sign in with a test user.
- Open `/compose` while logged out first if you want to confirm `/login?next=...` returns to the intended page after sign-in.

Create a first post:

- Open `/compose`.
- Type a short thought that sounds like a real user post.
- Submit.
- Confirm the submit button disables while posting.
- Confirm the success message appears.
- Open the post detail link.

Create enough posts for persona views:

- Create 3-5 posts with different language: reflective, playful, practical, social, or opinionated.
- Wait for client-side analysis to finish before submitting when the UI offers persona/buzz signals.
- If persona pages still show insufficient-data states, create one or two more posts and reload the persona pages.

Post detail and replies:

- Open `/p/[id]` from the compose success link, home feed, profile, search, or trending.
- Add a reply.
- Confirm the reply button disables while sending.
- Reload the page and confirm the reply remains visible.
- Confirm any error state is short, friendly, and does not expose backend details.

Save/bookmark:

- Click save/bookmark on a post.
- Confirm the UI state changes.
- Open `/saved`.
- Confirm the saved post appears.
- If collection controls are visible, change the collection and reload `/saved`.

Search and trending:

- Open `/search`.
- Search for a distinctive word from a demo post.
- Confirm results are understandable when present or empty.
- Open `/trending`.
- Confirm cards render or the empty state is useful.
- Confirm backend errors are sanitized.

Profile update:

- Open `/settings/profile`.
- Update display name, handle, bio, and optional avatar.
- Save.
- Confirm the save button disables while saving and a friendly success/failure message appears.
- Open `/u/[handle]` if the profile route is available for the updated handle.

Notifications:

- Open `/notifications`.
- For a new account, confirm the empty state is useful.
- If user B replied/followed/reacted, return as user A and confirm notifications appear.
- Mark one notification read by opening it when possible.
- Use "mark all read" when unread notifications exist.

Following/followers:

- Open a profile page from a post, search result, or trending result.
- Follow and unfollow if the control is shown.
- Confirm the control disables while updating.
- Open `/following` and confirm empty or populated states are understandable.

Messages/DM:

- Open `/messages`.
- Confirm the empty state links to search and persona lab.
- If a conversation exists, open `/messages/[id]`.
- Send a message.
- Confirm the send button disables while sending and success/failure feedback is friendly.
- Reload the conversation and confirm messages persist.

## Persona Demo Checks

Persona dashboard:

- Open `/dashboard/persona`.
- Confirm profile summary, radar, insights, quests, and evolution chart are readable.
- If insufficient-data guidance appears, follow it by creating more posts.

Persona feed:

- Open `/persona-feed`.
- Confirm the first-session guide appears when persona data is missing.
- Switch between available modes such as same-persona and compatibility.
- Open a feed item and return.

Persona evolution:

- Open `/persona-evolution`.
- Confirm the timeline reflects posting activity or clearly asks for more posts.

Persona lab:

- Open `/persona-lab`.
- Inspect compatibility prompts.
- If AI provider env names are not configured, confirm the UI fails softly and does not expose provider details.

Persona catalog:

- Open `/personas`.
- Open at least one `/personas/[key]` detail page.
- Confirm images, compatibility links, and unavailable states are friendly.

## Access Control Checks

Logged-out session:

- Open `/compose`; it should redirect to `/login?next=...`.
- Open `/saved`; it should redirect to login.
- Open `/notifications`; it should redirect to login or show a login CTA.
- Open `/api/me/timeline-signals`; it should return only a sanitized `401` or `503` JSON response.

Internal route gating:

- Open `/dashboard/ab-timeseries` without admin/dev access; it should not be publicly exposed.
- Open `/dashboard/timeline-learning` without admin/dev access; it should not be publicly exposed.
- Open `/api/personas/image-coverage` without admin/dev access; it should not expose diagnostics.
- In local development only, intentionally set the local internal route flag if you need to inspect those pages.

## Demo Script

Use this concise story during a portfolio demo:

1. "A user posts their thoughts."
   - Sign in, open `/compose`, write a short thought, and submit it.
2. "The app analyzes posts into a persona."
   - Show the post success state, then open `/dashboard/persona`.
3. "The persona evolves over time."
   - Create or reference several posts, then open `/persona-evolution`.
4. "The persona affects feeds."
   - Open `/persona-feed`, switch modes, and open a recommended post.
5. "The persona affects compatibility and prompts."
   - Open `/persona-lab` and show compatibility or prompt guidance.
6. "The persona becomes part of social identity."
   - Open a profile, saved post, notification, or DM flow to show the SNS layer.

Keep demo notes short:

- What account state you used: test user A, optional test user B.
- What routes passed.
- What was skipped and why.
- No secrets, no raw backend errors, no session screenshots.

## Windows / WSL Caveats

- Use the same environment for server and checks when possible.
- If the dev server runs in WSL, run `pnpm smoke:web` and `pnpm check:web-env` from WSL if PowerShell cannot reach the WSL localhost.
- If PowerShell runs the checks, make sure it can reach the dev server.
- Do not copy `.env.local` between Windows and WSL terminals through chat or issue comments.
- If browser storage gets confusing, use a private window or a separate browser profile for user A and user B.

## What Not To Record

- Do not record `.env`, `.env.local`, Supabase keys, service-role keys, LLM keys, tokens, cookies, passwords, magic links, or session values.
- Do not copy raw stack traces, SQL errors, provider responses, RPC failures, or internal diagnostic IDs into user-facing bug reports.
- Do not include browser devtools, network headers, auth storage, or key-bearing terminal output in screenshots.
