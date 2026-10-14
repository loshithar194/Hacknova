# SecondLife · Circular Electronics Reuse

SecondLife helps makers reuse electronics. Users record the parts they own, or pick a product
to build, and see what they can make, what is missing, and the estimated cost and impact.

- **Matching is deterministic.** A tested rules engine (`src/lib/matching.ts`) computes quantity
  match and feasibility. It never depends on an AI model.
- **Catalogue comes from Supabase** when configured, read completely with pagination and no fixed
  row cap. Without a database the app uses a bundled demo catalogue, and the UI says so.
- **E-waste submissions** are validated with the same rules in the browser and on the server, then
  stored under Row Level Security.
- **AI recommendations run on the server.** The model's output is validated, feasibility is recomputed
  by the rules engine, and the result is labelled as AI or rule-based.
- **AI project prediction** proposes new project ideas from the parts a user owns. It is not limited
  to the catalogue. The server checks every part against the catalogue, blocks mains, high-voltage,
  lithium and hazardous projects, and recomputes missing parts and feasibility itself.
- **Admin review** is protected by a server-side role check and by RLS.

---

## 1. Architecture

```
Browser (Vite + React)                      Node API (server/)                      Supabase
─────────────────────                      ──────────────────                      ────────
Catalogue ── anon key, RLS read ─────────────────────────────────────────────────▶ products, components
Sign-in   ── Auth REST ──────────────────────────────────────────────────────────▶ auth.users
E-waste   ── /api/* + user JWT ──▶ verify JWT (auth/v1/user)
Admin     ── /api/admin/* + JWT ─▶ check role (service key, server only) ───────▶ profiles
                                    │ user JWT  → insert/read own rows (RLS)  ──▶ ewaste_submissions
                                    │ service key → recommendations, status,  ──▶ reuse_recommendations
                                    │               admin list (after role check)
                                    └─ optional Anthropic Messages API (server key only)
```

Key files:

| Path | Purpose |
|---|---|
| `shared/submission.ts` | Submission and review validation (used by browser and server) |
| `server/ideas.ts` | AI project prediction: prompt, strict validation, safety gate, feasibility |
| `shared/catalogueMapping.ts`, `shared/pagination.ts` | Row mapping and complete paging, shared by both sides |
| `server/app.ts` | HTTP routes, auth, role checks, validation, error handling |
| `server/supabase.ts` | Supabase REST and Auth client (`fetch`, no SDK) |
| `server/recommendations.ts` | Recommendation pipeline: engine → AI → validation → fallback |
| `server/ai.ts` | Anthropic client, JSON-only parsing, output validation |
| `src/services/*` | Browser config, API client, catalogue loader, Supabase Auth |
| `src/components/CatalogGate.tsx` | Loads the catalogue before any page renders; shows errors with retry |
| `src/pages/EWaste.tsx`, `src/pages/Admin.tsx` | Submission form and admin review |
| `supabase/migrations/` | SQL migrations, applied in order |
| `test/` | Automated tests (see section 6) |

---

## 2. Environment variables

Copy `.env.example` to `.env.local`. Never commit real values.

| Variable | Where it is used | Secret? | Required for |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Browser | No (public) | Database catalogue, sign-in, e-waste, admin |
| `VITE_SUPABASE_ANON_KEY` | Browser | No (public; RLS protects data) | Same as above |
| `VITE_API_BASE_URL` | Browser | No | Only if the API is on another origin (empty = same origin) |
| `SUPABASE_URL` | Server | No | Server database access |
| `SUPABASE_ANON_KEY` | Server | No | Catalogue reads, token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | **Yes** | Recommendation writes, status changes, admin list |
| `ANTHROPIC_API_KEY` | **Server only** | **Yes** | AI recommendations (optional) |
| `ANTHROPIC_MODEL` | Server | No | Model name (default `claude-haiku-5-5`) |
| `API_PORT` | Server + dev proxy | No | Port for the API (default 8787) |
| `SERVE_DIST_DIR` | Server | No | Serve the built app from the API process (production) |
| `ALLOWED_ORIGINS` | Server | No | Comma-separated exact origins allowed for CORS (only for split deployments) |

Rules:
- Any variable starting with `VITE_` ends up **in the public JavaScript bundle**. Never put a
  service-role key or model key there.
- Without `VITE_SUPABASE_*`, the app still runs with the bundled demo catalogue. E-waste, admin and
  database features show a "not configured" message.
- Without `ANTHROPIC_API_KEY`, recommendations are returned as **rule-based**, with the reason shown.

---

## 3. Local development

Requirements: Node.js 20.11 or newer.

```bash
npm install
cp .env.example .env.local      # fill in values, or leave blank for demo mode
npm run dev                      # API on :8787 and Vite on :5173 (proxies /api)
npm test                         # automated tests
npm run build                    # type-check, then production build
```

Demo mode (no Supabase): `npm run dev` works with no `.env.local`. Personal inventory, saved
projects and the demo login stay in the browser.

---

## 4. Database setup (Supabase)

1. Create a project at supabase.com. In **Authentication → Providers**, make sure **Email** is enabled.
   Decide whether to require email confirmation (**Authentication → Sign In / Providers**). If you
   require it, new users must confirm before they can submit.
2. Open **SQL Editor** and run these files **in order**:
   1. `supabase/migrations/0001_profiles_and_roles.sql`: profiles, roles, `is_admin()`
   2. `supabase/migrations/0002_catalogue.sql`: components, products, requirements, read/write policies
   3. `supabase/migrations/0003_ewaste_submissions.sql`: submissions and their policies
   4. `supabase/migrations/0004_reuse_recommendations.sql`: stored recommendations
   5. `supabase/migrations/0005_seed_catalogue.sql`: demo catalogue (22 components, 7 products)
   6. `supabase/migrations/0006_ai_project_ideas.sql`: AI-predicted project ideas
   
   Or, with the Supabase CLI and a linked project: `supabase db push`.
3. Copy the project URL and keys from **Project Settings → API** into `.env.local`.
   Use the **anon** key for `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY`. Use the
   **service_role** key only for `SUPABASE_SERVICE_ROLE_KEY`, and never expose it to the browser.
4. **Create an admin.** Register through the app, then in the SQL Editor run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   Roles can only be changed in the database. The app has no route to grant admin.
5. Check the database is ready: `curl http://localhost:8787/api/health` should show `"database":"configured"`.

To update the demo catalogue after editing `src/data/catalog.ts`, run `npm run db:seed:generate`,
then re-run `0005_seed_catalogue.sql`. It upserts by id.

**Data policy summary**

| Table | Anonymous | Signed-in user | Admin | Server (service key) |
|---|---|---|---|---|
| components, products, requirements | read active rows | read active rows | read + write | read |
| profiles | none | own row (name editable, role not) | all rows | read role |
| ewaste_submissions | none | insert own, read own | read all, update status | read all, update |
| reuse_recommendations | none | read own | read all | write |
| ai_project_ideas | none | read own | read all | write |

---

## 5. Deployment

### Option A: one Node host (recommended)

The API also serves the built app, so the browser and API share one origin and no CORS setup is needed.

```bash
npm ci
npm run build                    # creates dist/
export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
export VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=...   # needed at BUILD time, so set before npm run build
export ANTHROPIC_API_KEY=...     # optional
export SERVE_DIST_DIR=./dist
npm start                        # listens on API_PORT or PORT
```

Set the `VITE_*` variables **before** `npm run build`, because Vite inlines them into the bundle.
Set the server variables in the host's secret store.

Any Node 20+ host works (Render, Railway, Fly.io, a VM). Put it behind HTTPS.
Start command: `npm start`. Build command: `npm ci && npm run build`.

### Option B: split hosting

Host the static `dist/` on any static host, and run the API elsewhere.

1. Build with `VITE_API_BASE_URL=https://api.example.com` set.
2. On the API host set `ALLOWED_ORIGINS=https://app.example.com`. Only exact origins are allowed.
3. Keep `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` on the API host only.

### Supabase Auth settings for production

- **Authentication → URL Configuration:** set the Site URL to your app URL and add it to the redirect list.
- Turn on email confirmation for production.
- Serve the app over HTTPS only. Session tokens are kept in `localStorage`, so add a strict
  Content-Security-Policy on the static host.

---

## 6. Tests and what they prove

Run with `npm test` (77 tests). Requires Node 20.11+ and the dev dependencies.

| File | What it proves |
|---|---|
| `test/matching.test.ts` | Quantity match formula; spec verification blocks Build Now; critical parts; substitutes; negative savings |
| `test/submission-validation.test.ts` | Every submission field rule; unknown or duplicate parts rejected |
| `test/ai-recommendations.test.ts` | Only JSON is accepted; unknown product IDs and weak output rejected; AI cannot override feasibility; provider errors do not leak keys; key sent only in the header |
| `test/supabase-client.test.ts` | Correct key per operation (user JWT for writes, service key only for admin writes); full paging; errors do not expose keys |
| `test/api.test.ts` | HTTP flows: 401 without session, 422 with field errors, 403 for non-admins, cross-user isolation (404), stored results, status updates |
| `test/integration-supabase-stub.test.ts` | Real server and real Supabase client over HTTP against a **local wire-format stub** (see limits) |
| `test/cors.test.ts` | CORS only for allow-listed origins |
| `test/ai-ideas.test.ts` | AI project prediction: accepted/rejected ideas, invented parts, safety gate, feasibility from owned parts, ownership over HTTP |
| `test/frontend-services.test.ts` | Browser config, API error handling, catalogue loading, auth messages, session storage |
| `test/catalogue.test.ts` | Live catalogue swap; paging with no fixed cap |

**Static checks run during development:** strict TypeScript for `shared/`, `server/`, `src/services/`,
`src/lib/`, `src/data/`, `test/`, `scripts/`. All UI files passed an esbuild bundle (syntax).

**Not verified in the development environment** (see section 8): live Supabase, live Anthropic calls,
the SQL migrations running against Postgres, and a browser run of the UI.

---

## 7. AI project prediction

Endpoints (owner only):

- `POST /api/submissions/:id/ai-ideas` generates ideas, validates them, stores them, and returns them.
  If AI is not configured, it returns `aiStatus: "not_configured"` with no ideas. The app does not
  fall back to the fixed catalogue.
- `GET /api/submissions/:id/ai-ideas` returns stored ideas.

What the server enforces, whatever the model returns:

1. Every part must be a catalogue component, with a whole-number quantity from 1 to 50.
2. Names, descriptions, steps and safety notes must meet length rules. At least one safety note is required.
3. A keyword gate rejects wording about mains voltage, 110–240 V, high voltage, lithium cells,
   flammable or explosive materials, and weapons.
4. Owned parts, missing parts, feasibility and estimated cost are computed by the matching engine.
   The model's claims about owned parts are ignored.
5. Ideas are returned as predictions with no "new product" price, because no comparable product is known.
6. Only validated ideas are stored. A rejected idea does not discard the others in the same reply.

## 8. Operational notes

- `npm run db:seed:generate` regenerates migration `0005` from `src/data/catalog.ts`.
- The API caches the catalogue for 60 seconds. Changes to products appear within a minute.
- Clients never write recommendations. They are written only by the server, after validation.
- `GET /api/health` reports `database` and `ai` status. It contains no secrets.
- Logs record database status codes and error categories only, never keys or provider payloads.

---

## 9. Limitations

These limits are real. Please read them before relying on the system.

0. **AI project ideas are not verified by a human.** The keyword gate and the engine catch many problems,
   but they cannot judge whether a circuit is correct or safe. Show ideas to users as suggestions to check,
   never as build instructions that are guaranteed to work. The model's quality on real parts is untested.
1. **Not run against a live Supabase project.** The migrations and RLS policies are written and reviewed
   but were **not executed against Postgres** in this environment. Run them, then check the table
   in section 4 with a test account before going live.
2. **The integration test uses a stub, not Supabase.** It verifies the server's requests and access
   choices, and it does not prove the SQL policies.
3. **AI output was not tested against a live model.** The prompt, JSON parsing, validation and fallback
   are tested with fake model responses. Output quality is unknown until you test it on real parts.
   The safety gate is keyword-based, so it can miss unsafe wording it has not seen.
4. **No browser-level UI test was run.** The React UI is syntax-checked, but its types could not be
   checked (React typings were not available here). Run `npm run build` and click through the flows
   before a demo.
5. **Session tokens use localStorage.** Refresh tokens are not used, so a session lasts about an hour.
   After that the user signs in again. Token refresh is not implemented.
6. **Personal inventory and saved projects remain in the browser** (localStorage). They are not
   synced to Supabase. Only e-waste submissions, recommendations, the catalogue and admin review use the database.
7. **Electrical safety is not guaranteed.** Recommendations warn about datasheets and the catalogue
   notes, and projects that need specs are never Build Now without recorded specs. A matching result
   does not certify that a circuit is safe.
8. **Prices are demonstration estimates in INR.** They are not live market prices.
9. **Admin role changes are manual.** There is no in-app role management. Use the SQL in section 4.
10. **Single-instance caching.** The catalogue cache lives in one process. Multiple instances each
    refresh it on their own schedule.
11. **Load More is client-side.** The full catalogue is downloaded once, and "Load more" reveals it
    in pages. This is appropriate for a catalogue of this size. For thousands of products, move
    filtering and paging to the database.
12. **Removed:** the old `supabase/schema.sql`. It defined tables the app no longer uses and conflicts with
    the migrations. Do not run it.
