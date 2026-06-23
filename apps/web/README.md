# PersonaLens Web

Next.js App Router frontend for the Supabase-backed persona SNS.

PersonaLens is a character/persona-based SNS: posts are analyzed, user personas evolve over time, and timelines can be personalized by persona compatibility and user feedback.

## Development

From the repository root:

```powershell
pnpm install
pnpm dev:web
pnpm -C apps/web build
pnpm build
pnpm smoke:web
pnpm check:web-env
pnpm qa:web-auth
```

Or from this package:

```powershell
pnpm -C apps/web dev
pnpm -C apps/web build
pnpm -C apps/web smoke
```

`pnpm smoke:web` expects a running local Web server and checks public pages, auth redirects, internal route gating, and one protected API response. The default target is `http://localhost:3000`; set `WEB_SMOKE_BASE_URL` to check another local URL.

`pnpm check:web-env` checks whether the required Web environment variable names are present for a real authenticated Supabase QA pass. It never prints values and exits non-zero only when required names are missing.

`pnpm qa:web-auth` prints a manual authenticated QA checklist. It does not log in, read credentials, or call Supabase.

For a full signed-in Supabase pass, use the authenticated demo runbook in `../../docs/web_authenticated_qa.md`.

## Demo Checklist

For a Web-only local demo:

```powershell
pnpm install
pnpm dev:web
pnpm smoke:web
pnpm check:web-env
pnpm qa:web-auth
```

- Open `/`, `/login`, `/search`, `/trending`, and `/personas` to confirm public pages.
- Sign in with a local test account that you created yourself; do not commit or share credentials.
- Create a short post from `/compose`, then open the post detail page.
- Visit `/dashboard/persona`, `/persona-feed`, `/persona-lab`, and `/persona-evolution` to show how posts grow the persona experience.
- Check `/saved`, `/notifications`, `/messages`, and `/settings/profile` for logged-in empty states and account polish.
- Open `/compose` in a logged-out or missing-env session to confirm the protected-route redirect still lands on login.

## Environment

Create `apps/web/.env.local` locally. Do not commit it.

```powershell
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_BASE_URL
```

Optional server-side AI settings can also be provided locally when testing AI-assisted features. Use `pnpm check:web-env` to see the full required/recommended/optional list without printing any values.

### AI post scoring with Groq

AI post scoring uses the deterministic dummy provider unless `LIE_JUDGE_PROVIDER` is explicitly configured. To use Groq's OpenAI-compatible API, set these server-side variables locally or in the Vercel project environment:

```powershell
LIE_JUDGE_PROVIDER=groq
GROQ_API_KEY=<secret>
GROQ_MODEL_NAME=llama-3.1-8b-instant
GROQ_API_BASE_URL=https://api.groq.com/openai/v1
LLM_TIMEOUT_MS=8000
```

`GROQ_API_KEY` is a server-only secret: never commit it and never rename it with a `NEXT_PUBLIC_` prefix. Groq free-tier and rate limits may apply. Provider failures, timeouts, invalid responses, and missing keys fall back to the labeled dummy result so posting still succeeds.

For local experiments, the existing Ollama provider remains available with `LIE_JUDGE_PROVIDER=ollama`, plus the optional `OLLAMA_BASE_URL` and `OLLAMA_MODEL_NAME` overrides.

## Web-only Scope

For Web development on Windows, use the commands above from the repository root. App Store, iOS, EAS, and `apps/mobile` commands are not required for Web-only work.

On Windows + WSL, run the smoke check from the same environment where the dev server is running if PowerShell cannot reach WSL `localhost:3000`.

Internal diagnostic routes under `/dashboard/*` are not exposed by default. In local development only, set `WEB_INTERNAL_ROUTES=1` to inspect them. In shared or production environments, use `WEB_ADMIN_EMAILS` with a comma-separated allowlist.
