# MemoryBook — Architecture (as it exists today)

> Audited commits: backend `4ff5afb`, frontend `69d5ff4` · 2026-11-14

## 1. System diagram

```
┌──────────────────────────┐   HTTPS + JSON     ┌────────────────────────────┐   Prisma    ┌────────────────┐
│ React SPA (Vite)         │  Bearer <JWT>      │ Express 5 API (TypeScript) │ ──────────► │ PostgreSQL     │
│ hosted on Vercel         │ ─────────────────► │ hosted on Render [unverif.]│             │ host unknown   │
│ token in localStorage    │                    │ /api/auth /books /pages    │             └────────────────┘
└──────────────────────────┘                    │ /reactions   /health       │ ──► Resend (password-reset email)
                                                └────────────────────────────┘
        Unused/dead: Supabase client, Lovable auth, Cloudinary, Multer, Anthropic SDK
```

## 2. Frontend architecture

**Folder layout (`src/`)**
```
App.tsx               routes + providers (QueryClient, Tooltip, Toasters, Router, AuthProvider)
main.tsx              entry
contexts/AuthContext  user/token state, login/register/logout, session restore via GET /auth/me
components/ProtectedRoute.tsx   redirects to /login when no user
components/ui/        49 shadcn components — only 12 are imported by the app, 37 are unused
lib/api.ts            fetch wrapper + authApi, booksApi, pagesApi, reactionsApi, uploadApi
pages/                Landing, Login, Signup, ForgotPassword, ResetPassword,
                      Dashboard, MemoryBookView, NotFound, Index (unused leftover)
integrations/         supabase/ + lovable/  (auto-generated Lovable scaffolding, never imported)
```

**Routes**

| Path | Page | Guard |
|---|---|---|
| `/` | Landing | public |
| `/login`, `/signup` | Login, Signup | public (no redirect when already logged in) |
| `/forgot-password`, `/reset-password?token=` | ForgotPassword, ResetPassword | public |
| `/dashboard` | Dashboard (book grid, search, create/rename/delete) | ProtectedRoute |
| `/book/:id` | MemoryBookView (pages, reactions, invite, add page) | ProtectedRoute |
| `*` | NotFound | public |

**State & data flow.** Each page owns its data with `useState` + `useEffect` and calls `lib/api.ts` directly. There is no caching layer, no optimistic-update strategy and no shared error handling (React Query is installed and mounted but unused). Types are `any` throughout the pages (23 of the 26 ESLint errors are `no-explicit-any`).

**Auth handling.** Token is stored in `localStorage['token']`. On app load, `AuthContext` calls `GET /auth/me`; on **any** failure (including a network error or backend cold start) it deletes the token and logs the user out. `request()` never reacts to a 401 mid-session.

**API base URL.** Hard-coded in `src/lib/api.ts`: `https://memorybook-backend.onrender.com/api`, with the comment "hitting production". There is no `VITE_API_URL`, so **local frontend development talks to the production backend and production database**.

**Styling.** Tailwind + CSS variables in `index.css`; custom utility classes (`paper-texture`, `page-shadow`, `washi-tape`) and button variants (`warm`, `hero`, `hero-outline`) give the scrapbook look. Responsive grid classes are used (`sm:`/`lg:` breakpoints). A `.dark` colour palette and `darkMode: ["class"]` are defined, but there is no theme provider or toggle, so dark mode is unreachable.

## 3. Backend architecture

**Pattern:** feature-module layout with thin controllers that talk to Prisma directly (no service layer).

```
src/
  server.ts                    connect Prisma, app.listen
  app.ts                       helmet → CORS allowlist → json(10mb) → routes → 404 → errorHandler
  config/db.ts                 Prisma singleton
  middleware/
    auth.ts                    requireAuth: verifies Bearer JWT, sets req.userId
    roleGuard.ts               requireRole(...roles): looks up BookMember for :bookId
    errorHandler.ts            logs; returns {error:"Internal server error"}
  modules/
    auth/       controller + routes
    books/      controller + routes (incl. members)
    pages/      controller + routes
    reactions/  controller + routes
  utils/        jwt.ts, email.ts (Resend), getString.ts (duplicated inline in 3 controllers)
prisma/schema.prisma
```

**Request pipeline:** `helmet` → `cors` (hard-coded origin allowlist: localhost 5173/8080/3000 + the Vercel URL) → `express.json({limit:'10mb'})` → route-level `requireAuth` (+ `requireRole('owner')` on owner-only book routes) → controller → Prisma. Express 5 forwards rejected async handlers to `errorHandler` automatically.

**Authorization model:** membership is the unit of access (`BookMember.role`). Enforcement is **inconsistent** — it is done by `requireRole` on owner-only book routes, by hand-written `findUnique` checks in some controllers, and **not at all** for page update/delete (see `IMPROVEMENT_PLAN.md`, section 1).

**Rate limiting:** one limiter (20 requests / 15 min) on `/api/auth/*` only. `trust proxy` is not set, so behind Render's proxy the limiter probably keys on the proxy IP rather than the client IP **[unverified — needs a test on the deployed service]**.

## 4. Database architecture (Prisma / PostgreSQL)

```
User 1───1 Profile                       (displayName, avatarUrl)
User 1───* MemoryBook      (createdBy)
User *───* MemoryBook      via BookMember (role: owner|contributor|viewer, unique[bookId,userId])
MemoryBook 1───* Page      (authorId → User, title, content JSON, pageNumber)
Page 1───* Reaction        (userId, emoji; unique[pageId,userId,emoji])
MemoryBook 1───* ActivityLog (userId, action string, details JSON)
```

| Table | Notable columns / constraints |
|---|---|
| `users` | `email` unique (case-sensitive), `password` (bcrypt hash), `reset_token` (**stored in plaintext**), `reset_token_expiry` |
| `profiles` | 1:1 with user, cascade delete |
| `memory_books` | `theme` free-form string with default `classic`; `cover_image_url` unused by UI |
| `book_members` | composite unique; cascade on book/user delete |
| `pages` | `content` JSON (UI stores `{ "text": "..." }`); `page_number` default 1 |
| `reactions` | unique per (page, user, emoji) |
| `activity_log` | `action` is an unconstrained string |

**Not present:** invitations table, tags, media/attachments table, page locks, soft-delete columns, any index beyond PK/unique constraints (e.g. no index on `pages.book_id` — Postgres does not auto-index FKs).

**Migrations:** none in the repo. The frontend repo contains an older Supabase-flavoured SQL migration (`auth.users`, RLS policies, storage bucket) that **mirrors the Prisma model but is a different design** (Supabase Auth vs. own `users` table). It is leftover from the Lovable scaffold.

## 5. API reference (19 API routes + `/health`, all verified in route files)

All paths are prefixed `/api` except `/health`. "Auth" = requires `Authorization: Bearer <JWT>`.

| # | Method | Path | Auth | Role | Purpose |
|---|---|---|---|---|---|
| 1 | GET | `/health` | – | – | Liveness JSON `{status, timestamp, environment}` |
| 2 | POST | `/auth/register` | – | – | `{email,password≥8,displayName≥2}` → `201 {token,user}` |
| 3 | POST | `/auth/login` | – | – | `{email,password}` → `{token,user}` |
| 4 | GET | `/auth/me` | ✔ | – | Current user |
| 5 | POST | `/auth/forgot-password` | – | – | `{email}` → generic message; emails a 1-hour token |
| 6 | POST | `/auth/reset-password` | – | – | `{token,password≥8}` |
| 7 | GET | `/books` | ✔ | member | My books + members + page count |
| 8 | POST | `/books` | ✔ | – | `{title≤100,description?,theme?}` → creator becomes owner |
| 9 | GET | `/books/:bookId` | ✔ | member | Book + members + page count |
| 10 | PATCH | `/books/:bookId/rename` | ✔ | owner | `{title}`; logs `book_renamed` |
| 11 | PATCH | `/books/:bookId` | ✔ | owner | Partial update (title/description/theme/coverImageUrl) — **no validation** |
| 12 | DELETE | `/books/:bookId` | ✔ | owner | Cascade delete |
| 13 | POST | `/books/:bookId/members` | ✔ | owner | `{email,role}` — adds an existing user immediately |
| 14 | DELETE | `/books/:bookId/members/:userId` | ✔ | owner | Remove member |
| 15 | GET | `/books/:bookId/pages` | ✔ | member | Pages ordered by `pageNumber` (no author/reactions included) |
| 16 | POST | `/books/:bookId/pages` | ✔ | **any member** | `{title,content,pageNumber?}` — no validation |
| 17 | PATCH | `/books/:bookId/pages/:pageId` | ✔ | **none checked** | Partial update |
| 18 | DELETE | `/books/:bookId/pages/:pageId` | ✔ | **none checked** | Delete |
| 19 | POST | `/reactions` | ✔ | member | `{pageId,emoji≤10 chars}` upsert → `201` |
| 20 | DELETE | `/reactions/:reactionId` | ✔ | owner of reaction | Remove own reaction |

**Dead code:** `getPage` (single page) is implemented but never routed.
**Called by frontend but missing on backend:** `POST /api/uploads/single`.
**Implemented but never called by frontend:** #11, #14, #17, #20.

**Error shape:** `{ "error": string }` — except validation errors, where `error` is a zod `fieldErrors` **object**. The frontend does `new Error(data.error)`, so validation failures can render as `[object Object]`.

## 6. Frontend ↔ backend communication flow

```
Login form ──POST /auth/login──► {token,user}
   └─ localStorage.token = token; AuthContext.user = user
Page load ──GET /auth/me (Bearer)──► user   (any failure ⇒ token deleted)
Dashboard ──GET /books──► books[] (client-side title search)
Book view ──GET /books/:id + GET /books/:id/pages (parallel)
Add page ──POST /books/:id/pages {title, content:{text}}  (pageNumber never sent)
React   ──POST /reactions {pageId, emoji}  (response appended to local state)
```

**Contract mismatches found**

| Frontend expects | Backend actually sends | Effect |
|---|---|---|
| `page.author.profile.displayName` | `getPages`/`createPage` return **no author** | Every page shows "by Unknown" |
| `page.reactions[]` | `getPages` includes **no reactions** | Reactions vanish from the UI after reload |
| distinct `pageNumber` | never set → default 1 | Every page says "Page 1"; order among ties is undefined |
| `error` as string | sometimes an object | `[object Object]` in UI |
| `/uploads/single` | route does not exist | Image upload cannot work |

## 7. Deployment architecture (as configured)

| Item | Frontend | Backend |
|---|---|---|
| Host | Vercel (per README + live URL) | Render (README, comments, API URL) **[unverified]** |
| Build | `vite build` → `dist/` | `npx prisma generate && tsc \|\| true` (the `\|\| true` swallows compile failures) |
| Start | static | `node dist/server.js` |
| Env vars used | none in active code (`VITE_SUPABASE_*` only in dead files) | `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL` |
| SPA routing config | **no `vercel.json` / rewrites** — deep links such as `/reset-password?token=…` may 404 on refresh **[unverified]** | – |
| Health check | – | `GET /health` |
| DB migrations in deploy | – | none (no migrate/db-push step in scripts) |
| CORS | – | hard-coded origins; the README's `CLIENT_URL` variable is **not read** |

`prisma` (CLI), `typescript` and `ts-node-dev` sit in `dependencies` rather than `devDependencies`, which happens to make the Render build work. The Prisma generator is pinned to `engineType = "binary"`, which is fine on Render but would need to change for a serverless (Vercel) backend.
