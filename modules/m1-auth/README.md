# Module 1 — User Authentication and Access Control

**Owner:** Member 1

## What this module owns

| Service | Port | Provides | Calls |
|---|---|---|---|
| `services/auth-service` | 4001 | POST /auth/login · GET /auth/me · GET /auth/verify · POST /auth/register · GET/POST /users · PATCH /users/:id/approve · PATCH /users/:id/role · PATCH /users/:id/archive · PATCH /users/:id/password (admin) | — |

**Pages** (in `pages/`): Landing.jsx (login, register, reset password) · UserManagement.jsx · Login.jsx, Register.jsx (not routed yet)

Every other service calls `GET /auth/verify` to check the caller, so keep that response shape stable: `{ uid, email, fullName, role }`.

Self-registration creates an unapproved officer account. The user cannot sign in or use a forwarded token until an administrator approves the account in User Management. Admin-created accounts are approved immediately. Run the root `npm run db:setup` command to add the approval column to an existing database; existing accounts remain approved.

## Run it alone

```bash
cd services/auth-service
cp .env.example .env      # MySQL settings + a long random JWT_SECRET
npm install
npm run dev               # http://localhost:4001/health
```

## Rules

- Change only files inside this folder.
- Pages import the shared app shell through `@/`, for example `@/lib/api` and `@/components/Modal`. Ask the leader if you need a change there.
- Keep the endpoints in the table above working; other modules depend on them.
