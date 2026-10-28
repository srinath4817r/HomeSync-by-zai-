# HOME SYNC

**One Home. One Family.** — a private, AI-assisted family management app with a liquid-glass interface: shared calendar, tasks, groceries, care & medicine reminders, bills, documents, home inventory, a live family map and an assistant that keeps the whole home in sync.

## Features

- Real **Continue with Google** sign-in (OAuth 2.0, verified by the server) — your Google name, email and profile photo
- Family accounts with role-based views: Family Admin / Parent / Senior Member / Child
- Guest mode — read-only preview without an account
- Live family map with consent-based location sharing
- AI assistant that creates tasks, groceries and reminders from chat
- Liquid-glass design system, light & dark themes, responsive from phones to desktops

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS 4 + shadcn/ui components
- Prisma ORM (SQLite locally)
- Zustand for client state
- Google OAuth 2.0 (authorization-code flow, server-side token exchange)

## Run locally

```bash
bun install          # or npm install
bun run db:push      # create the SQLite database from prisma/schema.prisma
cp .env.example .env # then fill in your Google keys (see below)
bun run dev          # http://localhost:3000
```

## Google sign-in setup (required once)

1. Open [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) and create a project.
2. **APIs & Services → OAuth consent screen** → type **External** → app name `HOME SYNC` → support email → save → click **Publish App** so every family member can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**, then add:
   - **Authorized JavaScript origins** → your app URL, e.g. `https://your-app.vercel.app` (no trailing slash)
   - **Authorized redirect URIs** → the same URL **with a trailing slash**, e.g. `https://your-app.vercel.app/`
4. Copy the **Client ID** and **Client secret** into your `.env` (or into your Vercel project's Environment Variables).

> Every place the app is browsed from needs its own redirect URI registered (localhost while developing, your Vercel URL in production — you can add several URIs under the same client).
> If Google shows `Error 400: redirect_uri_mismatch`, the URI above was not registered or does not match exactly — the app's login screen also has a built-in **Google sign-in setup** helper that shows the exact address to register.

## Deploy to Vercel

1. Push this repository to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New Project** → import the repo (Vercel auto-detects Next.js; `vercel.json` is already included).
3. Add Environment Variables in the Vercel project settings:
   - `DATABASE_URL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
4. Deploy, then add your new Vercel URL (with trailing `/`) as an **Authorized redirect URI** in Google Console (step 3 above).

### Database note for production

SQLite works great locally, but Vercel's filesystem is ephemeral — data written at runtime disappears. For a real production deployment, switch Prisma to a hosted database ([Neon](https://neon.tech), [Supabase](https://supabase.com), [Vercel Postgres](https://vercel.com/postgres) or [Turso](https://turso.tech)) and change the `datasource` provider in `prisma/schema.prisma`. The schema is standard and migrates as-is.

## Project structure

```
src/app/                  # Next.js App Router — single-page app + API routes
  api/auth/…              # login, Google OAuth callback, profile
  api/…                   # dashboard, tasks, groceries, events, bills, map, assistant…
src/components/homesync/  # liquid-glass UI: shell, login, views, map, icons
src/lib/homesync/         # types, session store, API helpers, seed data
prisma/schema.prisma      # database schema
```
