# Dos Tazas POS

Point-of-sale system for the **Dos Tazas** to-go coffee shop kiosks. Optimized for
touch use on tablets and phones, with a separate Floor (order taking) and Counter
(checkout) flow plus an Admin portal for menu, modifiers, staff, and reporting.

## Tech stack

- **Next.js 16** (App Router) + **React 19**
- **Supabase** (Postgres, Auth, Row Level Security) via `@supabase/ssr`
- **TanStack Query** for data fetching/caching
- **Tailwind CSS** for styling (light/dark themes)
- **Recharts** for analytics

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Create a `.env` (or `.env.local`) with your Supabase project credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### Database

Run the SQL migrations in `supabase/migrations/` in order against your Supabase
project (SQL editor or CLI). They create the schema, seed data, RLS policies, and
staff/modifier write policies. Each authenticated user has a `user_profiles` row
that scopes all data to their `location_id`.

## Scripts

| Command         | Description                       |
| --------------- | --------------------------------- |
| `npm run dev`   | Start the dev server              |
| `npm run build` | Production build                  |
| `npm run start` | Serve the production build        |
| `npm run lint`  | Lint (`npx eslint .`)             |

## App structure

- `app/login` — email/password auth.
- `app/pos/floor` — browse menu by category, build an order (with modifiers), and
  send it to the counter as a "parked" order.
- `app/pos/counter` — pick a parked order, take payment (card / cash / SINPE),
  optionally capture electronic-invoice details, complete or **void** the order.
- `app/admin` — dashboard, analytics, menu & inventory, modifiers, staff, transaction
  history, and CSV financial reports (admin role only).

## Roles

- **staff** — Floor + Counter.
- **admin** — everything above plus the Admin portal.

Access is enforced both in the UI (`app/admin/layout.tsx`) and at the database
level through Supabase RLS policies.
