# Exam Seating Planner

Admins enter halls with seat layouts and exam lists, and the app assigns seats automatically.
Students look up their hall and seat; proctors print seat maps.

Cloud Computing & Cloud Security group project (Group 42), built on the Lab 5 Cloud Issue Tracker starter.

| Layer | Technology | Cloud service |
|---|---|---|
| Frontend | HTML, CSS (Grid), vanilla JavaScript, `fetch()` | Vercel static hosting (`frontend/`) |
| API | Node.js 20+, Express 5 | Vercel Functions (`backend/`) |
| Data | PostgreSQL via `@neondatabase/serverless` | Neon (Free plan) |

## Services and owners

| Service | Owner | Backend files | Frontend files |
|---|---|---|---|
| Seat Allocation & Lookup | Mohamed Attallah | `routes/allocations.js`, `controllers/allocationController.js`, `services/allocationService.js` | `allocation.html`, `my-seat.html`, `proctor.html`, `seat-map.html` and their `js/` files |
| Hall & Seat Layout | Mohamed Rishi | `routes/halls.js` … | `halls.html` … |
| Exam & Enrolment | Nour | `routes/exams.js` … | `exams.html` … |
| Shared | team | `server.js`, `middleware/`, `routes/auth.js`, `services/db.js`, `services/passwords.js`, `services/audit.js`, `db/` | `index.html`, `js/api.js`, `js/login.js`, `css/style.css` |

How the services connect: [docs/integration-for-teammates.md](docs/integration-for-teammates.md).

## Run locally

```bash
# 1. Database: run backend/db/schema.sql, then backend/db/least-privilege.sql in the Neon SQL Editor
# 2. API
cd backend
cp .env.example .env          # paste DATABASE_URL (owner string for the seed)
npm install
SEED_PASSWORD='choose-a-demo-password' npm run seed
npm run dev                   # http://localhost:3000/api/health
# 3. Frontend (second terminal)
cd frontend
npx http-server . -p 8080     # http://localhost:8080
```

Demo accounts (password = SEED_PASSWORD): `admin@seatplanner.test`, `proctor1@seatplanner.test`,
`proctor2@seatplanner.test`, students `S2026001` … `S2026060`.

## API (Seat Allocation & Lookup)

| Method | Path | Role | Success | Errors |
|---|---|---|---|---|
| GET | `/api/allocations/overview` | admin | 200 | 401, 403 |
| POST | `/api/exams/:examId/allocation` `{spacing}` | admin | 201 | 400, 401, 403, 404, 409 |
| GET | `/api/exams/:examId/allocation?hallId=&student=` | admin | 200 | 400, 401, 403, 404 |
| PATCH | `/api/allocations/:assignmentId` `{hallId, seatLabel}` | admin | 200 | 400, 401, 403, 404, 409, 415 |
| POST | `/api/exams/:examId/allocation/publish` | admin | 200 | 400, 401, 403, 404, 409 |
| DELETE | `/api/exams/:examId/allocation` | admin | 204 | 400, 401, 403, 404, 409 |
| GET | `/api/me/seats` | student (own) | 200 | 401, 403 |
| GET | `/api/me/proctor-halls` | proctor (own) | 200 | 401, 403 |
| GET | `/api/exams/:examId/halls/:hallId/seat-map` | admin, assigned proctor | 200 | 400, 401, 403, 404, 409 |

Shared: `POST /api/auth/login` (200/400/401/415/429), `POST /api/auth/logout` (204), `GET /api/auth/me` (200/401), `GET /api/health` (200/503).

## Tests

Postman: import `evidence/allocation-service.postman_collection.json` and an environment from `evidence/`,
set `password`, run on freshly seeded data. 38 requests: normal, invalid and security cases.

## Security notes

No secrets in this repository. `.env` is git-ignored; real values live only in Vercel Environment Variables.
The app connects to Neon as `app_user` (row operations only, see `backend/db/least-privilege.sql`).
