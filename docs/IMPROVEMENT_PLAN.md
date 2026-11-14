# MemoryBook 2.0 — Improvement Plan & Roadmap

> Audited commits: backend `4ff5afb`, frontend `69d5ff4` · 2026-11-14
> **This is a plan, not a change.** Nothing has been modified. Per the agreed workflow, no item below is implemented until you approve the roadmap (section 6). Detailed per-feature specs (UI/API/DB changes, complexity, dependencies) for the new-feature list come in Phase 5 after that approval.
> Evidence references are `file:line-area` in the audited commits. **[unverified]** = inferred from code, not observed on the live deployment.

## 1. Existing problems

### 1.1 Security — fix first

| ID | Sev. | Problem | Evidence | Impact |
|---|---|---|---|---|
| S1 | **Critical** | **No authorization on page update/delete.** Routes only run `requireAuth`; the controller never checks book membership, authorship, or that the page belongs to `:bookId`. | `pages.routes.ts`, `pages.controller.ts` `updatePage`/`deletePage` | Any logged-in user holding a page UUID can edit or delete it, including after being removed from the book. |
| S2 | **High** | **`viewer` role is not enforced for writes.** `createPage` checks only that the caller is *a member*. The "Add Page" button is hidden in the UI, nothing more. | `pages.controller.ts` `createPage` | Read-only members can add pages via the API. |
| S3 | High | **No input validation on pages or book update.** Title/content are unbounded JSON; `theme` and `coverImageUrl` are arbitrary strings; body limit is 10 MB on every route. | `pages.controller.ts`, `books.controller.ts` `updateBook`, `app.ts` | Storage abuse, junk data, future stored-XSS vectors if content is ever rendered as HTML. |
| S4 | Medium | **Rate limiter probably ineffective behind Render.** `trust proxy` is unset, so all clients may share one bucket (20 attempts / 15 min *total*). Nothing is limited outside `/api/auth`. | `app.ts` | Either self-inflicted lockouts or no brute-force protection **[unverified]**. |
| S5 | Medium | **Email not normalised / not verified.** Case-sensitive unique email; no verification. Because invites are by email and instant, someone can pre-register a victim's address and receive their invites. | `auth.controller.ts`, `inviteMember` | Duplicate accounts; invite hijacking. |
| S6 | Medium | **User enumeration.** 409 on register, 404 "No user found with that email" on invite, and a 500-with-`error.message` path on forgot-password when email is unconfigured. | `auth.controller.ts`, `books.controller.ts` | Attackers can learn which emails have accounts. |
| S7 | Medium | **Reset token stored in plaintext; JWTs survive password reset;** no logout/revocation; JWT in `localStorage` (readable by any XSS). | `schema.prisma`, `jwt.ts`, `AuthContext.tsx` | Token theft via DB leak or XSS has long-lived effect (7 days). |
| S8 | Medium | **`removeMember` has no guard** against removing the owner/self (orphans the book) and throws a 500 for non-members. | `books.controller.ts` | Data integrity. |
| S9 | Low | `JWT_SECRET` is read with `!` and never validated at startup; no env validation at all. | `jwt.ts` | Misconfiguration surfaces as runtime 500s. |
| S10 | Low | CORS origins hard-coded (stale comment says env-driven); a blocked origin returns 500 rather than a clean CORS failure; no Vercel preview URLs. | `app.ts` | Deployment friction. |
| S11 | Low | Invite adds the user without consent (no accept/decline). | `inviteMember` | Privacy: people can be added to books unasked. |

No secrets were found in either repository (pattern scan of all tracked files; no tracked `.env`).

### 1.2 Functional bugs (all confirmed by tracing code)

| ID | Problem | Cause |
|---|---|---|
| B1 | Every page shows **"by Unknown"**. | `getPages`/`createPage` don't `include` the author; the UI reads `page.author.profile.displayName`. |
| B2 | **Reactions disappear on reload**, and double-clicking inflates the local count. | `getPages` doesn't include reactions; UI appends each POST response to local state although the API upserts. |
| B3 | Every page is "Page 1"; order is undefined for ties. | UI never sends `pageNumber`; default is 1; `orderBy` has no `createdAt` tiebreaker. |
| B4 | Validation errors can show as **`[object Object]`**. | API returns zod `fieldErrors` object; UI does `new Error(data.error)`. |
| B5 | Users get **logged out whenever the backend is briefly unreachable** (e.g. cold start). | `AuthContext` deletes the token on *any* `/auth/me` failure. |
| B6 | A 502/HTML response from the host shows "Unexpected token <". An expired token mid-session leaves the user stuck instead of redirecting to login. | `request()` always calls `response.json()` and ignores 401. |
| B7 | **Local dev writes to the production backend/database.** | `API_URL` hard-coded in `api.ts`. |
| B8 | Image upload cannot work. | Frontend calls `/api/uploads/single`; no such backend route; no UI uses it. |
| B9 | Book view says "Book not found" for any load failure; the shared `error` state is never cleared; dashboard load errors are only visible in the create dialog. | State handling in `MemoryBookView.tsx` / `Dashboard.tsx`. |
| B10 | Cannot clear a book description (or empty a page body). | `...(description && {...})` ignores empty strings. |
| B11 | Deep links (`/reset-password?token=…`, `/book/:id` on refresh) may 404 on Vercel. | No `vercel.json` rewrite **[unverified]**. |
| B12 | README/landing copy describes features and a stack (MongoDB, Axios, `controllers/` layout) that don't match reality. | Stale docs. |

### 1.3 Performance & scalability

- `GET /books` and `GET /books/:id` return **all members with nested profiles** on every call; `GET /pages` returns **all pages with full content** (no pagination) — fine for tiny books, linear growth after.
- Missing DB indexes on foreign keys (`pages.book_id`, `activity_log.book_id`, `reactions.page_id`, `book_members.user_id`).
- Frontend bundle is a single **551 kB** JS chunk (Vite warns); 37 unused UI components and 13 dependencies that no app-level file imports (e.g. `@supabase/supabase-js`, `recharts`, `react-hook-form`, `date-fns`, `cmdk`, `vaul`) inflate install time.
- Every authenticated request re-queries membership separately from the controller query (acceptable now; becomes a pattern worth centralising).
- Express app uses `app.listen` + Prisma `binary` engine — suited to Render, **not** serverless (Vercel). Decide the target before choosing.

### 1.4 Code-quality & tooling debt

- Frontend: **26 ESLint errors** (23 `no-explicit-any`, 2 `no-empty-object-type`, 1 `no-require-imports`), mostly in `Dashboard.tsx` and `MemoryBookView.tsx`; only a placeholder test; three lockfiles; leftover Lovable/Supabase files; two `use-toast` implementations.
- Backend: `strict: false`; build script ends in `|| true` (TypeScript errors never fail a deploy); no tests, linter, logger, or env validation; no migrations; `main: index.js` wrong; README wrong; `getString` defined 5 times; no service layer.
- Whole project: no CI, no `.env.example`, no Dockerfile, no API docs.
- I could **not** fully typecheck the backend here: `prisma generate` is blocked in the audit sandbox (403 from the engine download). Apart from the missing Prisma types, `tsc` reported no other errors — but with `strict: false` and untyped Prisma, that is weak assurance.

## 2. Technical improvements (summary)

1. **Authorization layer:** one `requireBookRole(minRole)` middleware used on every book-scoped route (pages included); page edit/delete = author or owner; resource must belong to `:bookId`.
2. **Validation:** zod schemas for every body/param; sane body limits (e.g. 100 kB JSON, separate limit for uploads); env validation at boot.
3. **Auth hardening:** lower-case emails; hash reset tokens; token-version claim to invalidate JWTs on reset; consider httpOnly-cookie sessions or short-lived access + refresh tokens; `trust proxy`; broader rate limits.
4. **Data layer:** add FK indexes; commit Prisma migrations; put activity-log writes in the same transaction; paginate pages and activity.
5. **API consistency:** include `author`, `reactions` (with "mine" flag) in page responses; uniform error shape `{error:{code,message,fields?}}`; central async/error handler; OpenAPI docs.
6. **Frontend data layer:** use the already-installed React Query for caching, loading/error states and optimistic reactions; central 401 handling; `VITE_API_URL`.
7. **Quality gates:** fix lint errors, real tests (Vitest + supertest + a test DB), GitHub Actions CI (typecheck, lint, test, build), remove `|| true`.
8. **Cleanup (needs your approval before deleting):** Supabase/Lovable leftovers, unused UI components and deps, duplicate lockfiles.

## 3. UI/UX improvements (summary — Phase 4)

- **Deliver the scrapbook promise:** real page-turn view (current UI is a vertical card list), page textures per theme, date + time + author on each page.
- Member list with roles, role change, remove, and "leave book"; pending-invite state.
- Skeleton loaders (component already exists), meaningful error and empty states, toast feedback instead of one shared error string.
- Reaction UX: toggle on/off, show who reacted, highlight my reactions.
- Accessibility: labelled icon buttons (the pages contain zero `aria-label`s and several buttons are icon-only: back, logout, delete, ⋯ menu), focus handling in dialogs, colour contrast review, `prefers-reduced-motion` for animations.
- Optional dark theme; mobile layout review for the nav (invite + add-page + member count in one row).
- Don't redesign what works: dashboard grid, auth screens and landing visual identity are consistent and should be kept.

## 4. Potential additional features (names only; full specs in Phase 5)

| Category | Candidates |
|---|---|
| Core | Image upload (Cloudinary, fits existing deps) · edit page · activity-log view · timeline view |
| UX | Page-flip reader · autosave drafts · rich text |
| Personalisation | Book cover & theme editing · avatar/profile page |
| Search & filter | Search pages by text/author/date · filter by member |
| Data management | PDF/print export · soft delete + undo · account/data deletion |
| Security & privacy | Invite links with accept/decline · email verification · locked pages · 2FA (optional) |
| Notifications | Invite emails · "new page" digest |
| Automation / AI | Auto title · tag suggestions · "on this day" flashback (the `@anthropic-ai/sdk` dependency is already installed) |

## 5. Recommended repository structure (Phase 3 preview — nothing moved yet)

```
MemoryBook/
├── frontend/            # Vite + React app, own package.json, own lockfile (npm only)
│   ├── src/ public/ ...
│   └── .env.example     # VITE_API_URL=
├── backend/             # keep the existing feature-module layout (it fits this app better than a flat controllers/ routes/ split)
│   ├── src/
│   │   ├── config/      # db.ts + NEW env.ts (zod-validated)
│   │   ├── middleware/  # auth, requireBookRole, errorHandler, rateLimit
│   │   ├── modules/     # auth, books, members(NEW), pages, reactions, activity(NEW), uploads(NEW)
│   │   │   └── <module>/ routes · controller · service(NEW) · schema(NEW)
│   │   └── utils/
│   ├── prisma/          # schema.prisma + migrations/ (NEW)
│   ├── tests/           # NEW
│   └── .env.example
├── docs/                # the four audit docs + later API.md / DEPLOYMENT.md
├── .github/workflows/   # CI (NEW)
├── .gitignore  README.md  LICENSE
```

Notes: keep frontend and backend **independently installable** (no workspace coupling, as you asked). Preserve both repos' git history by importing them with `git subtree add` (or `git filter-repo --to-subdirectory-filter`) rather than copying files. Legacy `supabase/` goes to `docs/legacy/` until you approve deleting it.

## 6. Prioritised MemoryBook 2.0 roadmap

**Milestone 0 — Safe foundation (no behaviour change)**
Create the unified repo with preserved history · add `.env.example` files · add CI (build + lint + typecheck) · document how to run locally · make the frontend read `VITE_API_URL` and point dev at a local backend (**fixes B7**) · fix the backend README.

**Milestone 1 — Correctness & security (Priority 1, essential)**
S1, S2, S3, S4, S5 (lower-casing at least), S8 · B1, B2, B3, B4, B5, B6, B9, B10 · FK indexes · commit Prisma baseline migration · env validation · remove `|| true` and make the build fail on errors · SPA rewrite for Vercel (B11) · tests covering the authorization matrix.

**Milestone 2 — Finish what is already promised (Priority 2, valuable)**
Image upload via Cloudinary (B8) · member management UI (list/role/remove/leave) · activity-log read API + UI and logging of *all* actions · reaction toggle with persisted display · edit page · invite emails with accept/decline · email verification · page-flip reader and skeleton/empty/error states · pagination · clean-up of dead code and dependencies (with your approval).

**Milestone 3 — Differentiators (Priority 3, advanced/optional)**
Google sign-in · AI title/tag suggestions and "on this day" flashback · locked pages · PDF export · search · doodles/stickers/voice notes/handwriting mode · dark theme · decide on Vercel-serverless vs Render hosting.

## 7. Decisions I need from you before Milestone 0

1. **Where is the Postgres DB hosted, and how was the schema applied?** (Determines how we baseline migrations safely.)
2. **Preserve git history** of both repos in the monorepo (my recommendation) or start fresh?
3. **Backend hosting target:** stay on Render (no change), or move to Vercel serverless (requires Prisma engine + app-entry changes)?
4. **Is there unpushed backend code** (e.g. an `uploads` module) on your machine?
5. **Scope of cleanup:** may I delete the Supabase/Lovable leftovers, unused UI components, and extra lockfiles when we reach that step?
6. Should **Google sign-in** be in 2.0 (it was in the original spec but never shipped)?
