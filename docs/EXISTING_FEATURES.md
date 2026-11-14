# MemoryBook — Existing Features

> Audited commits: backend `4ff5afb`, frontend `69d5ff4` · 2026-11-14
> **Status legend:** ✅ works end-to-end (by code reading) · ⚠️ works but with a defect · 🟡 backend only (no UI) · ❌ not implemented
> Nothing here was exercised against the live deployment (not reachable from the audit environment); statuses come from tracing UI → API → database in source. The frontend build and its single placeholder test pass.

## A. Features that exist

### 1. Authentication
| Feature | Status | Notes / limitations |
|---|---|---|
| Register (name, email, password ≥ 8) | ⚠️ | Creates `User` + `Profile`, returns JWT. Email is **not lower-cased**, so `A@x.com` and `a@x.com` become different accounts. A duplicate-email race returns 500 instead of 409. Email is never verified. |
| Login | ✅ | Same error for wrong email / wrong password (good). 7-day JWT, no refresh or revocation. |
| Session restore (`/auth/me`) | ⚠️ | Any failure — including a network blip or a cold-starting backend — wipes the token and logs the user out. |
| Logout | ✅ | Client-side only (deletes token). |
| Forgot / reset password | ⚠️ | Works via Resend; 1-hour token. Token is stored in plaintext, old JWTs stay valid after a reset, and if `RESEND_API_KEY` is missing the endpoint crashes with a 500 that leaks `error.message` (and only for existing emails). |
| Route protection | ✅ | `ProtectedRoute` on `/dashboard` and `/book/:id`. Logged-in users are *not* redirected away from `/login`. |
| Google / social sign-in | ❌ | Promised in the original spec. Only dead Lovable/Supabase scaffolding exists. |

### 2. Memory books
| Feature | Status | Notes |
|---|---|---|
| Create book (title, theme) | ✅ | 5 themes. API also accepts `description`, but the UI never sends it. Creator becomes `owner` atomically. |
| List my books | ✅ | Includes members and page count, newest-updated first. Search box filters by title **client-side only**. |
| Open book | ✅ | Members only (403 otherwise). |
| Rename | ✅ | Owner only; logged to activity log. |
| Delete | ✅ | Owner only; cascades to pages, reactions, members, log. No soft delete / undo. |
| Edit description / theme / cover | 🟡 | `PATCH /books/:id` exists, unvalidated, never called by UI. Cannot clear a description (falsy values are ignored). |
| Cover image | ❌ | Column exists; no upload, no UI. |

### 3. Collaboration & permissions
| Feature | Status | Notes |
|---|---|---|
| Roles owner / contributor / viewer | ⚠️ | Stored and shown in UI logic, but **enforced inconsistently** — a `viewer` can create pages by calling the API directly; any authenticated user can edit/delete any page by ID. |
| Invite by email | ⚠️ | Owner only. User must already have an account (404 otherwise, which also reveals which emails are registered). Member is **added instantly** — no accept/decline, no email notification, no invite link, no pending-invite state. |
| Remove member | 🟡 | Endpoint exists; no UI. Owner can remove themselves, orphaning the book. |
| Member list / role change / leave book | ❌ | UI shows only "N members". |
| Invite by username or shareable link | ❌ | In the original spec. |

### 4. Pages (memories)
| Feature | Status | Notes |
|---|---|---|
| Create text page (title + body) | ⚠️ | Contributors/owners see the button. Content stored as JSON `{text}`. `pageNumber` is never sent, so every page defaults to 1. |
| View pages | ⚠️ | Rendered as stacked cards with fade-in — **not** a flip-book. Always shows "by Unknown" (the API omits the author). Date shown is `createdAt`; time is not shown. |
| Delete page | ⚠️ | UI shows the trash icon only to the page's author (the owner cannot remove others' pages from the UI), but the API allows *anyone* to delete. |
| Edit page | 🟡 | `PATCH` exists; no UI. Not logged. |
| Images, voice notes, doodles, stickers, handwriting mode | ❌ | Promised in README and on the landing page. `uploadApi` calls a route that does not exist and is never used. |
| Page locking (member-restricted pages) | ❌ | |
| Timeline view / ordering by date | ❌ | Ordering is by `pageNumber` (all 1) with no tiebreaker. |

### 5. Reactions
| Feature | Status | Notes |
|---|---|---|
| Add reaction (❤️ 😍 🥹 ✨ 🔥 👏) | ⚠️ | Backend upserts (idempotent). UI appends the response to local state each click, so clicking twice shows count 2 while the DB holds 1. |
| Persisted display | ❌ | `GET pages` does not include reactions, so they disappear from the UI after any reload. |
| Remove / toggle reaction | 🟡 | Endpoint exists; UI never calls it and doesn't know which reactions are the user's. |

### 6. Activity log
| Feature | Status | Notes |
|---|---|---|
| Recording | ⚠️ | Only 4 actions are written: `book_created`, `book_renamed`, `member_invited`, `page_created`. Page edit/delete, reactions, member removal, uploads are **not** logged (the README claims they are). Writes are not in the same transaction as the action. |
| Viewing | ❌ | No read endpoint and no UI. |

### 7. Platform / misc
| Feature | Status | Notes |
|---|---|---|
| Landing page | ✅ | Hero, 6 feature cards, CTA, footer. Marketing copy claims AI features, doodles, stickers, voice notes and page-turn animations that do not exist. |
| 404 page | ✅ | |
| Health check | ✅ | `GET /health` |
| Responsive layout | ✅ (by CSS) | Tailwind breakpoints used; not tested on devices. |
| Loading / empty states | ⚠️ | Text-only "Loading…"; empty states exist for dashboard and book. Skeleton component exists but is unused. |
| Error display | ⚠️ | Book-load failures show "Book not found" regardless of cause; dashboard load failure is only visible inside the *create* dialog; one shared `error` state in the book view is never cleared. |

## B. Promised in README / spec / landing page but absent

AI title generation · AI tag suggestions · "memory flashback" (same date last year) · Google sign-in · image upload (Cloudinary) · voice notes · doodles · stickers · handwriting mode · page-turn animation · member-restricted/locked pages · PDF export · invite links/usernames · notifications · tags · search inside pages. (Dependencies for Cloudinary/Multer/Anthropic are installed but never imported.)

## C. Dead or leftover code

- Frontend: `src/integrations/supabase/*`, `src/integrations/lovable/*`, `supabase/` (config + SQL), `pages/Index.tsx`, `uploadApi`, `booksApi.update`, `use-toast` duplicate, 37 of 49 `components/ui/*` files, 3 lockfiles, unused deps (`@supabase/supabase-js`, `@lovable.dev/cloud-auth-js`, `recharts`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `cmdk`, `vaul`, …).
- Backend: `getPage` controller (unrouted), `getString` helper defined 5 times (4 inline copies plus a shared util that nothing imports), unused deps (`@anthropic-ai/sdk`, `cloudinary`, `multer`, `multer-storage-cloudinary`), stale `main: index.js`, README describing a MongoDB/`controllers/models` layout that does not exist.
