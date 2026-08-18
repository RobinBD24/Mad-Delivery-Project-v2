# Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce first-page payload, eliminate server-to-self HTTP on dashboard loads, and stop unused dashboard route prefetches without changing features or deleting data.

**Architecture:** Keep server components close to Prisma services. Load only active locale dictionary as a cacheable client chunk instead of serializing it into every RSC/HTML response. Change large always-visible dashboard navigation from viewport prefetching to user-intent prefetching.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, Auth.js 5 beta, Prisma 6, SQLite, Playwright 1.61, Node test runner.

## Global Constraints

- Preserve every feature, route, permission, translation, and database row.
- Do not modify unrelated dirty-worktree files.
- Read installed Next.js 16 documentation before changing framework behavior.
- Use red-green TDD for each production change.
- Do not commit or deploy; user did not request either action.
- Measure production mode, because automatic Next.js prefetching is production-only.

---

### Task 1: Stop serializing full dictionary into every page

**Files:**
- Create: `lib/i18n/client-dictionary.ts`
- Modify: `components/providers/language-provider.tsx`
- Modify: `app/layout.tsx`
- Create: `tests/performance-response.test.mjs`

**Interfaces:**
- Consumes: `Locale`, `Dictionary`, `messages/en.json`, `messages/bn.json`
- Produces: `loadClientDictionary(locale: Locale): Promise<Dictionary>`

- [x] **Step 1: Write failing response test**

Start from real production HTTP response. Assert `/login` does not contain unrelated dashboard dictionary key `"pendingPayments"` and raw HTML stays below 100,000 bytes.

```js
test("login does not serialize the application dictionary", async () => {
  const response = await fetch(`${baseUrl}/login`);
  const html = await response.text();
  assert.equal(html.includes('\\"pendingPayments\\"'), false);
  assert.ok(Buffer.byteLength(html) < 100_000);
});
```

- [x] **Step 2: Verify red**

Run:

```bash
PERF_BASE_URL=http://127.0.0.1:3102 node --test tests/performance-response.test.mjs
```

Expected: failure because current login is about 250KB and includes `pendingPayments`.

- [x] **Step 3: Add locale-specific client loader**

```ts
const loaders = {
  en: () => import("@/messages/en.json").then((module) => module.default),
  bn: () => import("@/messages/bn.json").then((module) => module.default),
};

const pending = new Map<Locale, Promise<Dictionary>>();

export function loadClientDictionary(locale: Locale): Promise<Dictionary> {
  let promise = pending.get(locale);
  if (!promise) {
    promise = loaders[locale]();
    pending.set(locale, promise);
  }
  return promise;
}
```

Use React `use(loadClientDictionary(locale))` inside `LanguageProvider`. Remove `dict` prop and `getDictionary()` call from root layout.

- [x] **Step 4: Verify green and translation behavior**

Run response test, build, login page audit, homepage audit, and Bengali/English E2E translation spec.

---

### Task 2: Remove dashboard server-to-self HTTP

**Files:**
- Modify: `lib/services/dashboards.ts`
- Modify: `app/(dashboard)/admin/dashboard/page.tsx`
- Modify: `app/(dashboard)/management/dashboard/page.tsx`
- Modify: `app/(dashboard)/marketing/dashboard/page.tsx`
- Modify: `app/(dashboard)/accounts/dashboard/page.tsx`
- Modify: `app/(dashboard)/branch-manager/dashboard/page.tsx`
- Modify: `app/(dashboard)/rider/dashboard/page.tsx`
- Modify: `app/(dashboard)/customer/dashboard/page.tsx`
- Test: `tests/performance-response.test.mjs`

**Interfaces:**
- Consumes: existing `requireRole()` result and dashboard service functions
- Produces: dashboard pages that query existing Prisma services directly; API routes keep same services and responses

- [x] **Step 1: Write failing proxy-host integration test**

Authenticate through local server, then request branch-manager dashboard with `X-Forwarded-Host: unreachable.invalid`. Current page self-fetches its API through that host and fails; direct service version must return 200.

```js
const response = await fetch(`${baseUrl}/branch-manager/dashboard`, {
  headers: {
    cookie: sessionCookie,
    "x-forwarded-host": "unreachable.invalid",
    "x-forwarded-proto": "https",
  },
});
assert.equal(response.status, 200);
```

- [x] **Step 2: Verify red**

Run targeted Node integration test against current production server. Expected: non-200 or fetch failure caused by server-to-self public-origin request.

- [x] **Step 3: Call service functions directly**

Replace:

```ts
const data = await getJSON<BranchManagerDashboard>("/dashboard/branch-manager/");
```

with:

```ts
const me = await requireRole("branch_manager");
const data: BranchManagerDashboard = await branchManagerDashboard(me);
```

Apply same pattern to seven dashboard landing pages. Keep API route handlers unchanged. Narrow service user input types to only fields each service reads.

- [x] **Step 4: Verify green**

Run proxy-host integration test plus dashboard E2E specs for all roles.

---

### Task 3: Replace viewport prefetch storm with intent prefetch

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `tests/e2e/44-performance.spec.ts`

**Interfaces:**
- Consumes: Next.js `Link`, `useState`
- Produces: sidebar link that starts with `prefetch={false}` and restores default prefetch after hover/focus/touch intent

- [x] **Step 1: Write failing browser test**

Attach route observer before login. After dashboard becomes visible, assert zero background sibling-route requests until user hovers a sidebar link; then assert selected route is prefetched.

- [x] **Step 2: Verify red**

Run production Playwright performance spec. Expected: current sidebar triggers multiple sibling-route prefetches immediately.

- [x] **Step 3: Add intent prefetch**

```tsx
function IntentPrefetchLink(props: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={() => setIntent(true)}
      onFocus={() => setIntent(true)}
      onTouchStart={() => setIntent(true)}
    />
  );
}
```

Preserve existing click handler, active state, styling, accessibility, and client-side navigation.

- [x] **Step 4: Verify green**

Run targeted performance test, dashboard layout test, full build, and measured Playwright profile.

---

### Task 4: Final measurement and regression gate

**Files:**
- Modify: `FULL_PAGE_AUDIT.md` only if benchmark evidence needs recording

**Interfaces:**
- Consumes: before/after raw HTML bytes, compressed bytes, browser request counts, TTFB, load timing
- Produces: evidence-backed result with no unsupported speed claims

- [x] **Step 1: Rebuild production**

Run `npm run build`.

- [x] **Step 2: Measure same routes**

Measure `/`, `/login`, authenticated dashboard, login transition, route-prefetch count, and live-poll duration using same localhost production server and browser profile.

- [x] **Step 3: Run regression checks**

Run lint, TypeScript build, response tests, auth/logout tests, i18n tests, dashboard layout tests, and performance specs.

- [x] **Step 4: Report exact gains**

Report before/after bytes, request counts, and timings. Mention remaining architectural work: other server pages still use `getJSON()` self-fetch and should migrate service-by-service under separate regression coverage.

---

### Task 5: Optimize static homepage images without changing upload behavior

**Files:**
- Create: `public/images/pizza/liquid-gold-card.webp`
- Modify: `lib/home/menu-data.ts`
- Test: `tests/e2e/44-performance.spec.ts`

- [x] **Step 1: Write and verify failing browser transfer test**

Assert the 1080px Liquid Gold product image uses a display-sized asset and transfers below 120KB. Baseline request served the original 242KB file directly.

- [x] **Step 2: Create a display-sized static asset**

The built-in optimizer was rejected after measurement: it preserved the already-WebP files byte-for-byte and caused three separate logo transfers. Keep runtime upload behavior unchanged and serve a visually verified 720px/87KB Liquid Gold card asset instead.

- [x] **Step 3: Rebuild, verify green, and remeasure**

Run the targeted browser regression, dashboard uploaded-image flows, build, lint, and the performance suite.
