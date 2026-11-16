# MinSU Disciplinary Management System

A web-based disciplinary case management system for Mindoro State University – Bongabong Campus: officers report incidents, track each student's case to resolution, and get statistics, reports and CSV exports.

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router
- **Backend:** six Node.js/Express API services, one per module (see [modules/README.md](modules/README.md))
- **Database:** MySQL 8 (`minsu_disciplinary`, schema in [database/schema.sql](database/schema.sql))
- **Login:** passwords hashed with bcrypt; sessions are JWTs issued by auth-service

## Run locally (Laragon, no Docker)

Requires Node.js 18+ and MySQL 8 (Laragon includes both).

1. Install everything:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` in the project root, and in each folder under `modules/*/services/`. In `modules/m1-auth/services/auth-service/.env`, set `JWT_SECRET` to a long random string.
3. In the root `.env`, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (8+ characters), then create the database and the first admin:
   ```bash
   npm run db:setup
   ```
4. Start the website and all services:
   ```bash
   npm run dev:all
   ```
5. Open http://localhost:5173 and log in with the admin account.

## Run with Docker

Runs MySQL, all six services and the website in containers. Needs only Docker Desktop.

1. Copy `.env.example` to `.env` and set long random values for `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` and `JWT_SECRET`, plus `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first admin. Set `SEED_SAMPLE_DATA=true` to start with fictional sample students and cases.
2. Start everything (use PowerShell or the VS Code terminal; Git Bash can trip Docker's file-permission check on Windows):
   ```bash
   docker compose up -d --build
   ```
3. Open http://localhost:8080 and log in with the admin account.

| Command | What it does |
|---|---|
| `docker compose ps` | Show what's running |
| `docker compose logs -f case` | Follow one service's log (`auth`, `student`, `incident`, `case`, `report`, `analytics`, `web`, `mysql`) |
| `docker compose down` | Stop everything (data is kept) |
| `docker compose down -v` | Stop and **delete the database** |

The database lives in the `mysql-data` volume and is reachable from your PC on port **3307** (user `minsu`, password `MYSQL_PASSWORD`), so it doesn't clash with Laragon's MySQL on 3306. The admin account is only created on first start; changing `ADMIN_*` later does nothing.

## Project structure

```
├── src/                 shared app shell: routes, layout, API client, session
├── modules/             one folder per team member's module (services + pages)
│   ├── m1-auth/         auth-service :4001
│   ├── m2-incidents/    student-service :4002, incident-service :4003
│   ├── m3-cases/        case-service :4004
│   ├── m4-dashboard/    analytics-service :4006
│   └── m5-reports/      report-service :4005
└── database/            schema.sql and the setup script
```

## Accounts

- Anyone can register from the login page; new accounts get the **officer** role.
- Administrators manage users under **User Management**: change roles, archive accounts, and set a new password for someone who forgot theirs (there is no email reset).

## Build for production

```bash
npm run build
```

The frontend is built into `dist/`. Each service is deployed separately; set its `.env` values (database, `JWT_SECRET`, other services' URLs) on the server.
