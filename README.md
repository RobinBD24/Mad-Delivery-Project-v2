# MAD DELIVERY HQ

A **Next.js-only full-stack** multi-branch food-delivery management system. The
public restaurant homepage, authentication, and every role-based dashboard
(customer, rider, branch manager, accounts, marketing, management, super admin)
are served by a single Next.js app — no separate backend service.

## Documentation

| File | What it covers |
| --- | --- |
| [`docs/COMPLETE_QA_REPORT.md`](./docs/COMPLETE_QA_REPORT.md) | Full QA verification report |
| [`docs/PLAYWRIGHT_QA_REPORT.md`](./docs/PLAYWRIGHT_QA_REPORT.md) | Playwright suite map + results |
| [`docs/HOMEPAGE_DESIGN_AUDIT.md`](./docs/HOMEPAGE_DESIGN_AUDIT.md) | Homepage / product-modal design parity audit |
| [`docs/DASHBOARD_DESIGN_AUDIT.md`](./docs/DASHBOARD_DESIGN_AUDIT.md) | Dashboard design parity audit |
| [`docs/CLEANUP_AUDIT.md`](./docs/CLEANUP_AUDIT.md) | Repository cleanup audit + verification |
| [`docs/QA_BUG_TRACKER.md`](./docs/QA_BUG_TRACKER.md) | Tracked bugs + resolutions |

## Tech stack

| Concern | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Route Handlers, Server Actions) |
| Language | TypeScript |
| Auth | Auth.js / NextAuth v5 (Credentials, JWT session) |
| Password hashing | bcryptjs |
| ORM / DB | Prisma — SQLite in dev, PostgreSQL-ready |
| Styling | Tailwind CSS v4 |
| i18n | Custom dictionary-based (Bangla `bn` default + English `en`) |
| Validation | Custom client + server validation (`<form noValidate>`) |

## Quick start

```bash
npm install
cp .env.example .env.local     # Next.js runtime
cp .env.example .env           # Prisma CLI
npx prisma migrate dev         # create the SQLite DB + tables
npm run seed                   # demo accounts + branch + catalog + orders (idempotent)
npm run dev                    # http://localhost:3000
```

Build / quality checks:

```bash
npm run lint
npm run build
```

## Environment variables

Copy `.env.example` to **both** `.env` (Prisma CLI) and `.env.local` (Next.js runtime).

**Required**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection string. Dev: `file:./dev.db` (SQLite). |
| `AUTH_SECRET` | NextAuth signing secret (`npx auth secret` to generate). |
| `AUTH_TRUST_HOST` | `true` for local/proxied hosting. |
| `NEXT_PUBLIC_APP_URL` | Public base URL (absolute links in prod). |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Default Super Admin created by the seed. |

**Optional — external integrations** (each has a working local/demo fallback; the app runs fully without them):

| Variable(s) | Feature | Fallback without it |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Live rider pin + delivery-zone map | Map placeholder + raw coordinates |
| `SMS_PROVIDER` / `SMS_API_KEY` / `SMS_SENDER_ID` | OTP / SMS login | Username/password login |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push | In-app DB notifications + bell |
| `BKASH_*` | bKash/card gateway | Cash + record-only bKash |
| (PDF/XLSX lib) | Server-side export | CSV export + browser print-to-PDF |
| `UPLOAD_DIR` | Runtime upload directory (default `storage/uploads`) | — (must be persistent + writable in prod) |
| `NEXT_PUBLIC_UPLOAD_BASE_URL` | External base for upload URLs (S3/R2/CDN) | Served via internal `/api/uploads` route |

## Demo / seed accounts

Run `npm run seed`. **Password for every account: `Admin12345@##`**

| Username | Role |
| --- | --- |
| `super_admin` | super_admin |
| `management` | management |
| `marketing` | marketing |
| `branch_manager` | branch_manager |
| `accounts` | accounts |
| `rider` | rider |
| `customer` | customer |
| `blocked_customer` | customer (blocked demo — shows block enforcement) |

Plus a default Super Admin from `ADMIN_*` (`admin` / `Admin12345@##`).

The seed also creates a **Main Branch** (manager + rider assigned), sample
categories/products, orders, rider commissions + withdrawals, reward rules +
ledger, reviews, complaints, a notice + notifications, delivery time slots, a
table reservation, Ramadan tables + booking, a rider route trail, and login
history — so every dashboard shows real data. **The seed is idempotent — safe to
re-run.**

## Folder structure

```
mad-delivery-hq/
├── app/
│   ├── (auth)/               # registration, forgot-password, registration-pending
│   ├── (auth-full)/          # login (full-bleed layout)
│   ├── (dashboard)/          # all role dashboards + shared profile/complaints
│   ├── api/                  # Route Handlers (the backend)
│   ├── layout.tsx  page.tsx  globals.css
├── components/               # UI + layout + per-role components
├── lib/
│   ├── db/                   # Prisma client singleton
│   ├── auth/                 # session + current-user guards + server actions
│   ├── services/             # business logic (orders, wallet, rewards, marketing, …)
│   ├── selectors/            # role-scoped Prisma queries
│   ├── serializers/          # Prisma record → API JSON
│   ├── validation/  constants/  i18n/  utils/  hooks/  api/
├── prisma/
│   ├── schema.prisma         # all models (38)
│   ├── seed.ts               # idempotent seed
│   └── migrations/
├── public/                   # brand assets (build-time static only)
├── storage/uploads/          # runtime user uploads (gitignored; served via /api/uploads)
├── types/                    # shared TS types + next-auth augmentation
├── messages/                 # bn.json / en.json translations
├── proxy.ts                  # route protection + role redirects (Next 16 middleware)
├── auth.ts  auth.config.ts   # Auth.js setup (Node + edge-safe split)
```

## User roles & redirects

| Role | After-login home |
| --- | --- |
| `super_admin` | `/admin/dashboard` |
| `management` | `/management/dashboard` |
| `marketing` | `/marketing/dashboard` |
| `branch_manager` | `/branch-manager/dashboard` |
| `accounts` | `/accounts/dashboard` |
| `rider` | `/rider/dashboard` |
| `customer` | `/customer/dashboard` |

- **Public registration creates `customer` accounts only** (auto-approved).
- **Staff accounts are created by a Super Admin** at `/admin/users/create` (pending until approved).
- Pending/rejected/blocked users cannot access protected pages or APIs.
- Role permissions are enforced in **every Route Handler (server-side)** — `proxy.ts` (Next 16 middleware) is UX-only.

## Database & Prisma

SQLite for local dev (zero setup). To use **PostgreSQL**:

1. In `prisma/schema.prisma`, set `datasource db { provider = "postgresql" }`.
2. Set `DATABASE_URL="postgresql://user:pass@host:5432/mad_delivery?schema=public"`.
3. Run `npx prisma migrate dev` (dev) or `npx prisma migrate deploy` (prod).

All model types (Decimal, DateTime, relations, JSON) are Postgres-compatible.
Enum-like fields are stored as strings and validated in the app layer.

## Internationalization

Bangla (`bn`, default) + English (`en`), switchable across the whole app.
Translations live in `messages/bn.json` and `messages/en.json` (kept at full parity).

System notifications are **key-based**: they store `titleKey`/`bodyKey` + `params`
and are translated to the viewer's locale at render time (never stored as
Bangla-only or English-only text). Param values tagged `@:<key>` (e.g. an enum
label `@:orderStatus.preparing`) are themselves re-translated on render.

## Notifications

A single global, in-app notification system serves **every** role.

**Model** (`prisma/schema.prisma` → `Notification`): `userId`, `type`, `title`,
`body`, `titleKey`, `bodyKey`, `params` (JSON), `link`, `isRead`, `noticeId`,
`createdAt`. Notifications are **per-user rows** — role/branch/broadcast sends
fan out to one row per recipient, so read-state is always per user and no query
can leak another user's inbox.

**Central service** — `lib/services/notifications.ts`. All modules use this
surface instead of writing notifications by hand:

| Helper | Recipients |
| --- | --- |
| `notifyUser(userId, p)` | one user |
| `notifyRole(role, p, branchId?)` | every approved+active user of a role (optionally branch-scoped) |
| `notifyBranch(branchId, p)` | a branch's managers + assigned riders |
| `notifyBranchManagers(branchId, p)` | a branch's managers |
| `notifyAll(p)` | everyone |
| `notifySuperAdmins / notifyAccounts / notifyManagement / notifyMarketing(p)` | a team |
| `notifyOrderCustomer(orderId, p)` | the order's customer |
| `notifyAssignedRider(orderId, p)` | the order's rider |
| `publishNotice(...)` | a broadcast notice fanned out to its audience |

**Categories** (`type`): `system`, `order`, `delivery`, `payment`, `withdrawal`,
`commission`, `complaint`, `reward`, `review`, `marketing`, `reservation`,
`ramadan`, `notice`, `security`, `account`, `branch`, `catalog`.

**Events wired**: order placed / status change / rider-assigned / cancelled;
new order & rider delivery updates → branch managers; commission added;
withdrawal requested → accounts, decided → rider; refund → customer + super
admins; complaint create/reply/status; coins earned/redeemed; rider & food
reviews; marketing campaigns; account created/approved/rejected/blocked/
unblocked; branch assigned; product held; reservation & Ramadan bookings;
broadcast notices.

**API** (all require auth; scoped to the caller — 401 anon, 403 wrong role;
never leak another user's rows):

| Route | Purpose |
| --- | --- |
| `GET /api/notifications` | own inbox (paginated; `?unread=1`) |
| `GET /api/notifications/unread-count` | `{ count }` for the topbar badge |
| `POST /api/notifications/[id]/read` | mark one read (own only) |
| `POST /api/notifications/read-all` | mark all read |
| `DELETE /api/notifications/[id]` | delete one (own only) |
| `POST /api/notices` | super admin / marketing broadcast → fan-out |

**UI**: topbar bell (`NotificationBell`) polls `unread-count` every 30s and
shows a role-scoped badge; each role has a `/…/notifications` page
(`NotificationsView` + `NotificationList`) with per-category icons,
all/unread/read filter, mark-one (on open), mark-all, translated
empty/read/unread states, and action links.

**Preferences**: a customer toggle (`User.notificationsEnabled`, set at
`/customer/settings`) suppresses **optional** notifications only — the
`marketing` category. All transactional/security categories (order, payment,
withdrawal, complaint, account, …) are **always delivered** regardless of the
toggle.

**Real-time**: near-real-time via 30s polling of the unread count; the
notification page revalidates after mark-read actions. Browser push
(Web Push / VAPID) is an optional external integration — **not enabled** by
default; set `VAPID_*` to add it. Without it, the in-app bell + inbox are fully
functional.

## Deployment notes

- Set a strong `AUTH_SECRET` and a PostgreSQL `DATABASE_URL`; set `NEXT_PUBLIC_APP_URL` and `AUTH_TRUST_HOST=true`.
- Run `npx prisma migrate deploy` on release.
- **Images are WebP-only.** Static assets under `public/` are all `.webp` (plus a few vector `.svg`). Re-run the converter after adding raster art:
  ```bash
  npm run images:convert            # public/*.{png,jpg,jpeg,bmp,tiff,avif} → .webp
  npm run images:convert -- --delete # also remove the originals
  ```
  (`.svg`/`.ico`/manifest icons are left untouched.)
- **Uploads:** every uploaded image is validated (allowed input: `image/jpeg`, `image/png`, `image/webp`, `image/avif`; max 5MB), **auto-converted to WebP** (sharp, EXIF-baked, metadata stripped), and stored as `<subdir>/<uuid>.webp` in the runtime `UPLOAD_DIR` (default `storage/uploads`, **not** `public/`), then served by the `/api/uploads/[...path]` route handler. The final stored asset is always `.webp` — originals are never persisted. This is deliberate — Next.js `next start` serves `public/` from a build-time snapshot, so files added there after the build 404 in production. Point `UPLOAD_DIR` at a **persistent, writable** disk in production (a mounted volume). For serverless / multi-instance hosting, set `NEXT_PUBLIC_UPLOAD_BASE_URL` to an object-store (S3/R2/CDN) base and push files there from `lib/http/upload.ts` — the only place that writes the filesystem. Legacy `/uploads/...` DB values still resolve via `public/` for backward compatibility.
- All external integrations are optional and key-gated (see the env table); the app is fully functional without them.
