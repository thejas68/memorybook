# MemoryBook — Project Overview

> **Audit date:** 2026-11-14
> **Audited commits:** backend `4ff5afb` (thejas68/memorybook-backend), frontend `69d5ff4` (thejas68/memorybook-frontend)
> **Method:** every statement below was derived from reading the actual source in both repos, then cross-checked by running the frontend build/lint/tests and scanning both repos for secrets. Items I could not verify are marked **[unverified]**.

## 1. What MemoryBook actually is

MemoryBook is a **private, invite-only collaborative journal**. A signed-in user creates a "memory book" (a titled, themed container), invites other registered users by email as *contributors* or *viewers*, and members add **text "pages"** to the book. Members can react to pages with a small set of emojis instead of commenting. The product framing is "private emotional storytelling for small groups", not social media.

What it **is today** is a working but early-stage MVP: authentication, book CRUD, role-based membership, text pages, and emoji reactions. A large part of the vision in the README and on the landing page (images, voice notes, doodles, stickers, page-flip UI, AI features, Google sign-in, PDF export) is **not implemented** — see `EXISTING_FEATURES.md` for the exact gap.

## 2. Main functionality (implemented)

| Area | What works today |
|---|---|
| Accounts | Email + password registration, login, "who am I" session check, forgot/reset password by email (Resend), client-side logout |
| Books | Create (title + one of 5 themes), list "my books", open a book, rename (owner), delete (owner, cascades to pages/reactions/members) |
| Collaboration | Roles `owner` / `contributor` / `viewer`; owner invites an **already-registered** user by email |
| Pages | Create a text page (title + body), list pages in a book, delete a page |
| Reactions | Add one of six emojis to a page |
| Activity log | Events are *recorded* in the database for 4 actions — but nothing reads or displays them |

## 3. Target users

Small, closed groups who want a shared keepsake rather than a feed: couples, families, close friends, classmates, travel groups. The five book themes (`classic`, `travel`, `family`, `friendship`, `romantic`) reflect exactly these audiences.

## 4. Technology stack

### Frontend (`memorybook-frontend`)
| Concern | Choice |
|---|---|
| Framework / build | React 18 + TypeScript, Vite 5 (SWC) |
| Routing | react-router-dom 6 |
| Styling / UI kit | Tailwind CSS 3, shadcn/ui (Radix primitives), lucide-react icons, custom "paper-texture / washi-tape" theme classes |
| Animation | framer-motion (fade/slide-in cards — **not** page-flip) |
| HTTP | Native `fetch` wrapper in `src/lib/api.ts` (the README says Axios — incorrect) |
| State | React `useState` + a single `AuthContext`; React Query is mounted but **never used** |
| Tests | Vitest + Testing Library configured; the only test is a placeholder `expect(true).toBe(true)`; Playwright configured, no e2e tests |
| Hosting | Vercel (https://memorybook-frontend.vercel.app) |
| Origin | Scaffolded by **Lovable** (leftover Supabase + Lovable auth files remain, unused) |

### Backend (`memorybook-backend`)
| Concern | Choice |
|---|---|
| Runtime / framework | Node.js, Express **5**, TypeScript (`strict: false`) |
| Database / ORM | **PostgreSQL via Prisma 5** (the README still says MongoDB — incorrect) |
| Auth | bcryptjs (cost 12), JWT (HS256, 7-day expiry) in `Authorization: Bearer` header |
| Validation | zod 4 (used in auth/books/reactions; **not** used for pages or book update) |
| Security middleware | helmet, CORS allowlist, express-rate-limit (auth routes only) |
| Email | Resend (password reset only) |
| Declared but **unused** dependencies | `@anthropic-ai/sdk`, `cloudinary`, `multer`, `multer-storage-cloudinary` |
| Hosting | Render (per README, code comments, and the hard-coded frontend API URL) **[unverified — no dashboard access]** |

## 5. Repository facts

- **Two repos, no shared tooling, no CI, no Dockerfile.**
- Neither repo contains a tracked `.env` file, and a pattern scan for API keys, JWTs, private keys and DB connection strings found **no committed secrets**. Neither repo has a `.env.example`.
- Frontend carries **three lockfiles** (`package-lock.json`, `bun.lock`, `bun.lockb`).
- Backend has **no tests, no lint config, no migrations folder** (only `prisma/schema.prisma`).

## 6. Open questions for the owner

These cannot be answered from the code and affect later phases:

1. Where is the PostgreSQL database hosted (Supabase? Neon? Render?), and how was the schema applied — `prisma db push`, since there is no migrations folder?
2. The frontend repo contains the original Lovable/Supabase SQL (with `auth.users` + RLS). Is that Supabase project still alive, and does `DATABASE_URL` point at it?
3. The frontend calls `POST /api/uploads/single`, but no such route exists in the backend repo. Is there an uploads module on your machine that was never pushed?
4. Is the Render service on a free tier (cold starts)?
