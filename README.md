# Beach house room booking

Web app for friends and family to claim **half-day slots** (AM / PM in **America/Chicago**) on two fixed resources: **guest room (queen)** and **guest living area (double sofa bed)**. The stay defaults to **July 3–July 31 nights** with **August 1 exclusive**.

## Setup

1. Copy [`.env.example`](.env.example) to `.env.local` and fill in secrets and `DATABASE_URL` (Neon or any Postgres).

   `npm run db:push` and `npm run db:seed` load **`.env.local`** (and `.env`) so Drizzle sees `DATABASE_URL` — same as Next.js.

2. Push schema and seed the two resources:

   ```bash
   npm run db:push
   npm run db:seed
   ```

3. Run locally:

   ```bash
   npm run dev
   ```

4. Open `/unlock`, enter `SITE_PASSPHRASE`, then use **Calendar**, **Trip info**, **Your bookings**, and **Admin**.

## Behavior

- **Passphrase** (cookie): required to view the app; set `SITE_PASSPHRASE`.
- **Bookings**: contiguous half-days on one resource; same day can be AM guest A / PM guest B.
- **Magic link**: after a public booking, email sends a **guest JWT** link to `/me` (if `RESEND_*` is set; otherwise the API returns `devMagicLink` in JSON).
- **Admin**: `ADMIN_SECRET` at `/admin` — full delete/list and audit log; can PATCH any reservation via the same API as guests (with admin cookie).
- **Exports**: `/api/calendar.ics` (merged or `?resourceId=1|2`). Optional `CALENDAR_FEED_TOKEN` for subscription-style URLs without a browser cookie.

## Guest email (Resend)

Do this when you want **real inboxes** to receive the “manage your bookings” link after someone saves a calendar slot (not only `devMagicLink` in the API / server logs).

### 1. Create an account and API key

1. Sign up at **[resend.com](https://resend.com)** (GitHub login is fine).
2. Open **API Keys** → **Create API Key** → name it (e.g. `beach-house-prod`) → copy the key (starts with `re_`).
3. Put it in **`.env.local`** as `RESEND_API_KEY` and add the same key in **Vercel → Settings → Environment Variables** for Production when you deploy.

### 2. Sending domain (production)

Resend only lets you send to **arbitrary recipients** once you send **from** an address on a **verified domain**.

1. In Resend: **Domains** → **Add domain** → enter the domain you control (e.g. `yourfamily.com`).
2. Add the DNS records Resend shows (usually **TXT** for SPF/DKIM, sometimes **MX** if you enable receiving). Save at your DNS host (Cloudflare, Google Domains, etc.).
3. Wait until Resend marks the domain **Verified**.
4. Pick a from-address on that domain, e.g. `bookings@yourfamily.com`.
5. Set in **`.env.local`** and Vercel:

   ```env
   RESEND_FROM="Beach House <bookings@yourfamily.com>"
   ```

   Quotes are optional unless the display name has commas. The email part **must** be on the verified domain.

### 3. App URL in links

Magic links use **`NEXT_PUBLIC_APP_URL`** (see [`.env.example`](.env.example)). For production it must be your real site, e.g. `https://your-app.vercel.app`, with **no** trailing slash—otherwise emails will point at localhost or the wrong host.

### 4. Quick test without your own domain

Resend’s **`onboarding@resend.dev`** sender is for **trying the API** only; delivery rules are limited (often **only to the email you verified** on your Resend account). For a friends-and-family beta, **verifying your domain** (step 2) is the reliable path.

### 5. Verify end-to-end

1. Restart `npm run dev` after editing `.env.local`.
2. Unlock the site, book a slot with **your** email.
3. You should get **Manage your beach house visit bookings**; the API should return `"magicLinkSent": true` (and no need for `devMagicLink` unless send failed).

If `"magicLinkSent": false`, check **Vercel / local logs** for `[mail] Resend error:` and confirm the domain is verified and `RESEND_FROM` matches it.

## Deploy (send a link for feedback)

This app fits **[Vercel](https://vercel.com)** (Next.js) and **[Neon](https://neon.tech)** (Postgres). You run database setup **once** from your laptop; Vercel hosts the app only.

### Accounts to create

| Service | Why | Signup |
|--------|-----|--------|
| **GitHub** | Host the repo; Vercel imports from git | [github.com](https://github.com) |
| **Vercel** | Hosting, env vars, HTTPS URL | [vercel.com](https://vercel.com) → sign up → **Continue with GitHub** |
| **Neon** | Serverless Postgres (`DATABASE_URL`) | [neon.tech](https://neon.tech) → new project, region near you |
| **Resend** | Guest magic-link email | [resend.com](https://resend.com) — see **Guest email (Resend)** above |

Without Resend, bookings still work; magic links appear in server logs / API responses instead of inboxes.

### Neon

In the Neon dashboard: **Connection details** → copy the **connection string** (include `?sslmode=require` if Neon shows it). Use the same string in Vercel and locally for `db:push` / `db:seed`.

### Secrets

Generate long random values (password manager or `openssl rand -hex 32`). **`SESSION_SECRET` and `GUEST_JWT_SECRET` must each be at least 16 characters.** Avoid `#` inside values (some hosts treat it as a comment).

### Vercel project

1. [Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project** → **Import** your repo (install the GitHub app if asked).
2. Framework: **Next.js** (defaults for build/output are fine).
3. **Environment Variables** — add every variable from the table below for **Production** (and **Preview** if you use branch previews).

### Environment variables (Vercel)

Names match [`.env.example`](.env.example).

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Neon `postgresql://…` connection string |
| `SITE_PASSPHRASE` | Yes | Shared phrase for `/unlock` |
| `ADMIN_SECRET` | Yes | Separate secret for `/admin` |
| `SESSION_SECRET` | Yes | **≥ 16 chars** — site unlock cookie |
| `GUEST_JWT_SECRET` | Yes | **≥ 16 chars** — guest JWT for `/me` |
| `STAY_YEAR`, `STAY_MONTH_START`, `STAY_DAY_START`, `STAY_MONTH_END_EXCLUSIVE`, `STAY_DAY_END_EXCLUSIVE`, `TIMEZONE` | Yes | Same meaning as `.env.example` |
| `NEXT_PUBLIC_APP_URL` | Yes (prod) | Live base URL **with** `https://`, **no** trailing slash (e.g. `https://your-app.vercel.app`). Used for magic links. |
| `RESEND_API_KEY` | No | From Resend when you enable email |
| `RESEND_FROM` | No | e.g. `Beach stay <onboarding@resend.dev>` for tests; production often needs a **verified sending domain** in Resend |
| `CALENDAR_FEED_TOKEN` | No | Optional; gates `/api/calendar.ics` without a browser cookie |

Deploy (or **Redeploy**) after saving env vars.

### One-time database on Neon

Vercel does **not** run migrations. From your machine, with the **same** `DATABASE_URL` as Vercel:

```bash
cd beach-house-booking
export DATABASE_URL='postgresql://YOUR_NEON_URL'
npm install
npm run db:push
npm run db:seed
```

Or put `DATABASE_URL` in `.env.local` and run the `npm run` lines only.

Then open your production URL → **`/unlock`** → share **`SITE_PASSPHRASE`** with testers. Use **`/admin`** with `ADMIN_SECRET` for yourself.

### Custom domain (optional)

Vercel → your project → **Settings** → **Domains** → add a domain and follow DNS steps. Update **`NEXT_PUBLIC_APP_URL`** to match and **Redeploy** so new magic links use the right host.

### Resend on Vercel

Set **`RESEND_API_KEY`** and **`RESEND_FROM`** in the Vercel project (Production). Use a **verified domain** and matching `RESEND_FROM` (see **Guest email (Resend)**). Redeploy after changing env vars.

## Troubleshooting

- **Magic links point at localhost** — Set **`NEXT_PUBLIC_APP_URL`** on Vercel to your real `https://…` URL and redeploy. It is baked in at build time.
- **Email not received but booking saved** — Check logs for `[mail] Resend error:`. Common causes: domain not **verified** in Resend, `RESEND_FROM` not on that domain, or Resend **sandbox** limits on `resend.dev`. Confirm **`NEXT_PUBLIC_APP_URL`** is correct so the link in the email matches your deployed site.
- **`/me` magic link said Unauthorized** — Fixed: **Your bookings** no longer requires the family passphrase. The email link loads `/me` directly; only a valid guest token is required for the API. If you still see errors, open the link in a fresh tab so the `token=` query is applied once (it is copied into session storage and removed from the URL).
- **No passphrase prompt** — The site sets a **30-day browser cookie** after you unlock once. That is normal. Use a private/incognito window to test a “first visit,” or clear site data for `localhost`.
- **`Unauthorized` / calendar won’t load** — Restart `npm run dev` after editing `.env.local` (especially `SESSION_SECRET`). Unlock again. Always use the **same host** (`http://localhost:3000` vs `http://127.0.0.1:3000` are different cookies). If you change `SESSION_SECRET`, old cookies stop working.
- **Middleware vs API env** — `next.config.ts` runs `loadEnvConfig` so Middleware (Edge) sees the same secrets as API routes. If you still see mismatches, confirm `SESSION_SECRET` is at least **16 characters**.

## Tech

Next.js (App Router), Drizzle ORM, Postgres, Resend (optional), `jose` for JWT cookies and guest links.
