# LeadFlow CRM Production Deployment

This deployment keeps the Next.js frontend on Vercel and the Express + Socket.IO backend on a long-running Node host such as Render or Railway.

## Recommended production architecture

```text
Vercel
  └── Next.js frontend
       ├── HTTPS API calls ───────────────┐
       └── Socket.IO websocket ────────────┤
                                           ▼
Render / Railway
  └── LeadFlow Express API + Socket.IO
       ├── MongoDB Atlas
       ├── Meta webhook
       └── 1-hour follow-up reminder worker

AWS S3
  └── private CRM documents
```

Do not deploy this Express + Socket.IO backend as ordinary Vercel serverless API routes. The app needs a persistent process for Socket.IO, Meta webhook handling, held-lead release checks and the hourly follow-up reminder worker.

## 1. MongoDB Atlas

Create a dedicated production database user.

Example database:

```text
leadflow
```

Example connection string:

```text
mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/leadflow?retryWrites=true&w=majority&appName=Cluster0
```

If the password contains `@`, `#`, `%`, `/`, `:` or other URI-reserved characters, URL-encode the password.

For example:

```text
MyPass@123
```

becomes:

```text
MyPass%40123
```

Allow the backend host to connect to Atlas. For a first deployment, Atlas Network Access can use `0.0.0.0/0` only if the database user has a strong password and least-privilege database access; use a fixed outbound-IP allowlist when your hosting plan supports it.

## 2. Backend on Render

Create a **Web Service**.

Recommended settings:

```text
Repository: LeadFlow CRM repository
Root Directory: backend
Runtime: Docker
Dockerfile: Dockerfile
Health Check Path: /health
```

The supplied `backend/Dockerfile` builds the TypeScript API and starts `dist/server.js`.

Production environment variables:

```env
NODE_ENV=production
PORT=4000
MONGO_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGO_DB_NAME=leadflow
JWT_SECRET=<32+ character random secret>
JWT_EXPIRES_IN=1d
FRONTEND_URL=https://YOUR-APP.vercel.app
META_VERIFY_TOKEN=<random webhook verification token>
META_APP_SECRET=<Meta app secret>
META_ACCESS_TOKEN=<server-side Meta access token>
META_GRAPH_VERSION=v24.0
AWS_REGION=ap-south-1
AWS_S3_BUCKET=<private bucket>
AWS_ACCESS_KEY_ID=<IAM access key>
AWS_SECRET_ACCESS_KEY=<IAM secret>
AWS_S3_PRESIGN_EXPIRES=900
```

`REDIS_URL` is currently infrastructure-ready but the follow-up reminder does not require Redis. You can leave the default only if no Redis-backed worker is enabled.

After deployment, verify:

```text
https://YOUR-API.example.com/health
```

Expected:

```json
{
  "ok": true,
  "service": "leadflow-crm-api"
}
```

## 3. Frontend on Vercel

Create a Vercel project using the same repository.

Set:

```text
Root Directory: frontend
Framework: Next.js
```

Production environment variables:

```env
NEXT_PUBLIC_API_URL=https://YOUR-API.example.com/api
NEXT_PUBLIC_SOCKET_URL=https://YOUR-API.example.com
```

Do not put MongoDB, JWT, Meta access tokens or AWS secret keys in `NEXT_PUBLIC_*` variables.

Redeploy after changing environment variables.

## 4. CORS

Set the backend `FRONTEND_URL` to the exact Vercel production URL:

```env
FRONTEND_URL=https://your-crm.vercel.app
```

Multiple trusted frontend origins can be comma-separated:

```env
FRONTEND_URL=https://your-crm.vercel.app,https://crm.yourdomain.com
```

Do not use `*` with credentials.

## 5. Socket.IO

The frontend must use:

```env
NEXT_PUBLIC_SOCKET_URL=https://YOUR-API.example.com
```

not `/api`.

The API uses:

```env
NEXT_PUBLIC_API_URL=https://YOUR-API.example.com/api
```

The Socket.IO server authenticates the same JWT used by the REST API. If the JWT expires, the frontend clears the session and sends the user back to login instead of repeatedly generating API/socket authentication errors.

## 6. Meta webhook

After the backend is live, use:

```text
Callback URL:
https://YOUR-API.example.com/api/meta/webhook
```

Use the exact same value as:

```env
META_VERIFY_TOKEN=...
```

Configure Meta to subscribe the Page/leadgen event after webhook verification succeeds.

## 7. AWS S3

Keep the bucket private.

The browser uploads using a presigned PUT URL. Document downloads use short-lived signed URLs.

Allow the Vercel origin in the S3 CORS configuration and permit browser `PUT` with `Content-Type`.

Never expose `AWS_SECRET_ACCESS_KEY` in frontend variables.

## 8. Follow-up reminders

Every follow-up stores:

```text
scheduledAt
reminderAt = scheduledAt - 24 hours
reminder24hSentAt
```

The backend checks reminders immediately on startup and then once per hour. Each hourly check looks one hour ahead (`reminderAt <= now + 1h`), so normal operation sends the reminder no later than about 59 minutes before the exact 24-hour point. The stored `reminderAt` remains the canonical timestamp.

If the server restarts, due reminders are still detected. The `reminder24hSentAt` field prevents duplicate reminders.

For an appointment at:

```text
03 Oct 2026 15:00
```

its reminder is:

```text
02 Oct 2026 15:00
```

With the one-hour look-ahead, normal operation sends the reminder before the 24-hour point. If the backend is completely offline across the reminder window, the startup check catches it later. If exact-to-the-minute delivery becomes mandatory, move this job to BullMQ/Redis or a managed scheduler.

## 9. Lead pagination

Leads, follow-ups and business projects use:

```text
10 records per page
```

The previous-page bug was caused by page 1 not being reloaded when the state changed from page 2 to page 1. The updated frontend loads every page, including page 1.

Search is debounced at approximately 350ms.

## 10. Authentication troubleshooting

When a protected API returns `401`:

```text
Browser token
    ↓
Authorization: Bearer <JWT>
    ↓
Express JWT verification
    ↓
valid → request continues
invalid/expired → 401
    ↓
frontend clears session and redirects to login
```

If every request returns `401` immediately after deployment, check:

1. `JWT_SECRET` is identical across all backend instances.
2. The frontend points to the correct production API URL.
3. The browser has a current `leadflow_token`.
4. The login request is going to the production API, not localhost.
5. Backend and frontend clocks are reasonable.

If Socket.IO alone fails authentication, verify `NEXT_PUBLIC_SOCKET_URL` points to the backend root and that the backend CORS origin matches the Vercel URL.

## 11. Go-live checklist

- [ ] MongoDB production user created
- [ ] MongoDB Atlas connection tested
- [ ] `leadflow` database selected in URI
- [ ] Strong JWT secret configured
- [ ] Meta verify token configured
- [ ] Meta app secret/access token configured server-side
- [ ] S3 private bucket configured
- [ ] S3 CORS configured
- [ ] Backend `/health` returns `ok: true`
- [ ] Vercel `NEXT_PUBLIC_API_URL` points to production API
- [ ] Vercel `NEXT_PUBLIC_SOCKET_URL` points to production API root
- [ ] Backend `FRONTEND_URL` matches Vercel origin
- [ ] Admin login tested
- [ ] Sales login tested
- [ ] Profile name update tested
- [ ] Lead pagination tested page 1 → 2 → previous → 1
- [ ] Follow-up pagination tested
- [ ] Business pagination tested
- [ ] Lead search/debounce tested
- [ ] New Meta lead realtime popup tested for salesperson
- [ ] Manual lead assignment realtime popup tested
- [ ] Follow-up creation popup tested
- [ ] 24-hour reminder tested with a test follow-up
- [ ] Reschedule creates a new active follow-up and closes the old one
- [ ] Cancelled follow-up does not generate a reminder
- [ ] Hold schedule tested with a short future window
- [ ] Held lead is released after the window
- [ ] Audit Log removed from normal navigation
- [ ] Production logs visible in hosting provider
