# Deployment (Neon + Vercel, same path as Lab 5)

## 1. GitHub
1. Create a **public** repository `exam-seating-planner` (the final report requires a public repo). Do not add a README/.gitignore.
2. In the project folder: `git init`, `git branch -M main`, `git add .`, **`git status` – stop if `.env` is listed**, then commit and push.

## 2. Neon database
1. Neon → New project `exam-seating-planner` (region close to Vercel, e.g. US East).
2. SQL Editor → paste and run `backend/db/schema.sql`.
3. Open `backend/db/least-privilege.sql`, replace `REPLACE-WITH-A-LONG-RANDOM-PASSWORD` **in the editor only** (do not save it into the file you commit), run it.
4. Connect → copy the **owner** connection string (for the seed only).
5. Build the **app** string: same string, but user `app_user` and the password from step 3:
   `postgresql://app_user:<password>@<same-host>/neondb?sslmode=require`

## 3. Seed demo data (from your laptop)
```bash
cd backend
cp .env.example .env            # DATABASE_URL = OWNER string
npm install
SEED_PASSWORD='pick-a-demo-password' npm run seed
```
Then change `DATABASE_URL` in `.env` to the **app_user** string and run `npm run dev`.
Frontend: `cd frontend && npx http-server . -p 8080`, open http://localhost:8080 and log in.

## 4. Vercel – API project
1. Vercel → Add New → Project → import the repo → **Root Directory: `backend`** → Deploy.
2. Settings → Environment Variables (Production), then Redeploy:

| Name | Value |
|---|---|
| `DATABASE_URL` | the **app_user** connection string |
| `CORS_ORIGINS` | `http://localhost:8080,https://<web-project>.vercel.app` |
| `NODE_ENV` | `production` |
| `RATE_LIMIT_MAX` | `120` |
| `LOGIN_RATE_LIMIT_MAX` | `10` |

3. Check `https://<api-project>.vercel.app/api/health` → `{"status":"ok","database":"ok"}`.

## 5. Vercel – web project
1. In `frontend/js/config.js` and `frontend/vercel.json` replace `YOUR-API-PROJECT` with the API project domain. Commit and push.
2. Vercel → Add New → Project → same repo → **Root Directory: `frontend`** → Deploy.
3. Put the web URL into the API's `CORS_ORIGINS` and redeploy the API.

## 6. Verify
- Postman: environment "Seat Planner cloud" with `baseUrl` = API URL and `password` = seed password; run the collection.
- Browser: admin runs + publishes CS301, student `S2026001` sees seat A1, `proctor1` prints the Hall A1 map.
- Logs: Vercel → API project → Logs (filter by status 401/403/429). Neon SQL Editor → `backend/db/monitoring-queries.sql`.

## Recovery
- Data: re-run `schema.sql` + `least-privilege.sql` + `npm run seed`, or Neon → Restore (point in time) on the free plan's history window.
- Config: everything except secrets is in Git; secrets are re-entered in Vercel. If a secret leaks: change the `app_user` password in Neon (`ALTER ROLE app_user PASSWORD '...'`), update Vercel, redeploy; delete `sessions` rows to log everyone out.
