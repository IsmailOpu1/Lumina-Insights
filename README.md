# Welcome to my Ai Powered Dashboard project
A complete business intelligence platform that feels like having a smart business advisor,
marketing expert, and operations manager all in one app — built specifically for the Bangladeshi
e-commerce and social commerce market.
The product is built to be sold as a multi-tenant SaaS product to other business owners, with
each customer having their own isolated workspace. 

## Stack
- React 18 + TypeScript + Vite, Tailwind and shadcn/ui
- Supabase: auth, Postgres with row level security, realtime, storage, edge functions
- Gemini for the AI features (called only from edge functions), Resend for invite emails
- Hosted on Vercel; `main` deploys to production

## Local development
```bash
npm ci
cp .env.example .env   # fill in the Supabase URL and publishable key
npm run dev            # http://localhost:8080
```

## Checks
These run in CI on every pull request:
```bash
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npm test
npm run build
```

## Database and edge functions
- `supabase/migrations` mirrors the live database. Add schema changes as new migrations; don't edit the database by hand.
- `supabase/functions` holds the edge functions. Shared helpers live in `supabase/functions/_shared`.
- Edge function secrets (set in Supabase, not in this repo): `GEMINI_API_KEY`, `RESEND_API_KEY`, and optionally `RESEND_FROM` and `SITE_URL`.
