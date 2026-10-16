# Caption Lab Admin

A separate admin panel for [Caption Lab](https://github.com/lfg2131/week1-hello-world) (Week 6). It is a separate Next.js 16 app, GitHub repository and Vercel project, connected to the **same Supabase project** (`msxlfmgpvyyrpvzrnqhu`).

| Route | What it does |
|---|---|
| `/login` | Google sign-in (public, shows no data) |
| `/auth/callback` | OAuth code exchange → `/admin` (public) |
| `/denied` | Access denied for signed-in non-admins (shows no data) |
| `/admin` | **Overview**: registered users, AI captions, distinct image posts, votes, Funny vs Not funny split, captions and votes per day (14 days), latest captions and votes |
| `/admin/users` | **Users** (read-only): name, email, sign-in provider, joined, last sign-in, profile name/username, captions and votes per user; search and pagination |
| `/admin/media` | **Media** (CRUD on `ai_captions`): create with Gemini, list with image, perspective, tone, creator, prompt, model and vote tally; edit; delete |
| `/admin/votes` | **Votes** (read-only): vote, caption, voter, time; filter Funny / Not funny; sort newest/oldest |

## Security model

Every admin page, layout and Server Action checks access on the server and fails closed:

1. **Login wall** (`proxy.ts`): no session means a redirect to `/login`, or a 401 for `/api/*`. Only `/login` and `/auth/callback` are public.
2. **Authentication** (`lib/auth.ts`): `supabase.auth.getUser()` asks Supabase Auth to validate the session, so signed-out, expired or forged sessions are rejected.
3. **Authorization** (`lib/auth.ts`): `caption_lab_admins.is_superadmin` must be exactly `true` for that verified user id. It is read with the service role, because clients cannot read or write the table at all. A missing row, `false`, or any error means **denied**.
4. `requireAdmin()` runs at the top of the admin layout **and** of every page. It redirects to `/login` or `/denied`, and it is the only way to get the privileged client.
5. `assertAdmin()` runs as the **first statement of every Server Action**. It returns an error before any database, storage or Gemini work.

There is no hardcoded admin email and no client-side admin flag. The service-role key is read in exactly one file, `lib/supabase/privileged.ts`, which is marked `server-only`. It is never `NEXT_PUBLIC_`, never sent to the browser, and never committed. Tests check this, and the build output was scanned for it.

Least privilege in the database:
- The service role can SELECT/DELETE `ai_captions`, INSERT the generation columns, and UPDATE only `caption`, `tone` and `perspective`.
- It can only SELECT `caption_votes`.
- It can only SELECT `caption_lab_admins`.

Users, votes and admin membership have no write path in this app.

### Media CRUD details
- **Create:**
  1. The photo is uploaded with the admin's own session into their own folder (existing Storage RLS).
  2. The server re-checks the real bytes, then asks Gemini for **one** caption with the same prompt, validation and **10-word limit** (bounded retry) as Caption Lab.
  3. It stores creator, image path, caption, the exact prompt, model, alt text, perspective, tone and context. If anything fails, the upload is removed.
- **Update:** caption text (1–200 characters, **≤ 10 words**, re-validated on the server and by the DB check), perspective and tone.
- **Delete:** a two-step confirmation lists the consequences. The caption's votes are removed by the existing `ON DELETE CASCADE`. The photo is removed from Storage **only if no other caption still uses it**.

## Database (migrations live in the main repo)
- `supabase/migrations/20261016120000_week6_public_explore_admins.sql`: creates `caption_lab_admins` (RLS on, no policies, no client grants).
- `supabase/migrations/20261016121000_week6_admin_service_role_grants.sql`: the service-role grants above.

### Bootstrapping the first admin
No one is an admin by default. The first admin is added once, through a **trusted SQL Editor / Supabase MCP operation** run as the database owner. First, check the account in `auth.users` / `auth.identities` (do not guess the UUID):
```sql
insert into public.caption_lab_admins (user_id, is_superadmin, note)
select u.id, true, 'bootstrap: verified owner'
from auth.users u
where u.id = '<verified-uuid>' and u.email = '<owner-email>'
  and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
on conflict (user_id) do update set is_superadmin = true;
```
For Week 6, this was done for the verified owner account only. Revoke with `update public.caption_lab_admins set is_superadmin = false where user_id = '…';`.

## Environment
See `.env.example`. On Vercel, `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are **Sensitive** variables. The Supabase URL and publishable/anon key are public by design.

## Development
```bash
npm install
npm run dev          # http://localhost:3001
npm test             # unit tests (Supabase + Gemini mocked)
npm run lint && npm run build
npm start & npm run test:smoke   # live signed-out checks against :3001
```
