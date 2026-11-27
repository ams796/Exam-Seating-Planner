# Exam Seating Planner — Group 42

Cloud-based automatic exam seat allocation. Admins describe halls and exams once, and the system seats every student according to explicit rules: capacity, blocked seats, spacing, no double bookings. Students look up their own seat, and proctors print an up-to-date plan for their hall.

| Service | Owner |
|---|---|
| Hall & Seat Layout (+ auth hardening, logging/monitoring) | Mohamed Rishi |
| Exam & Enrolment (+ deployment, database, external API) | Nour Alabbas |
| Seat Allocation & Lookup (+ event worker, security testing) | Mohamed Attallah |

**Stack:** HTML/CSS/vanilla JS frontend on S3 · Node.js + Express 5 microservices behind an API gateway · Neon Postgres · deployed on **Floci** (local AWS emulator) using S3, SNS, SQS (+DLQ), DynamoDB, Secrets Manager, EventBridge, IAM, CloudWatch Logs/Metrics/Alarms, ELBv2 and ECS. External API: Calendarific (Egyptian public holidays).

## Run it

```bash
cd backend
cp .env.example .env        # fill in (see comments); never commit .env
npm install
npm run floci:up            # start Floci in Docker
npm run db:setup            # tables + per-service least-privilege DB roles (first time only)
npm run db:seed             # demo accounts + halls (first time only)
npm run provision           # create all AWS resources on Floci, load secrets
npm run deploy:web          # upload the frontend to S3
npm run dev                 # gateway :8080 + all services
```

App: http://localhost:4566/esp-frontend/index.html · Health: http://localhost:8080/api/health · Floci console: http://localhost:4566/_floci/ui

See [docs/CONTRACT.md](docs/CONTRACT.md) for the architecture, ownership, data model, events and business rules.
