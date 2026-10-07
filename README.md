# LeadFlow CRM

LeadFlow is a real-estate CRM for Meta Lead Ads, business/project configuration, scoped sales work, follow-ups, client documents, realtime notifications and audit transparency.

## Core architecture

```text
Meta Lead Form
   -> Meta leadgen webhook
   -> Express API
   -> leadgen_id -> Meta Graph API
   -> BusinessProject source matching
   -> MongoDB Lead
   -> Global Admin delivery schedule
       -> HELD: persist silently
       -> RELEASED: capacity-aware random salesperson assignment
   -> Scoped Notification + Socket.IO
   -> Admin workspace / assigned salesperson workspace
```

## Role model

```text
ADMIN
  Full CRM access
  Business setup
  Meta mappings
  S3 upload/delete
  Lead hold schedule
  Sales capacity
  Manual assignment
  All leads/follow-ups/notifications

MANAGER / SALES
  Assigned/related leads only
  Own follow-ups
  Related notifications
  Documents from projects attached to their assigned leads
```

## Business project flow

Admin opens **Business Projects** and creates a project through four screens:

1. **Stage** — Ongoing, Upcoming or Completed.
2. **Project** — RERA, developer, penthouse, stage-specific details and multiple product types. Product forms change according to the selected type.
3. **Meta** — multiple Page ID, Ad Account ID, Campaign ID, Ad Set ID, Ad ID and Form ID mappings. This step can be skipped.
4. **Documents** — select files directly. Each selected file uploads to AWS S3 and the returned storage metadata is saved. This step can be skipped.

## Project documents

Salespeople never need to know or paste an S3 URL. They can only open documents belonging to a project attached to their assigned lead.

```text
Admin selects brochure.pdf
        ↓
Backend creates presigned S3 PUT URL
        ↓
Browser uploads file directly to S3
        ↓
Backend saves storageKey + URL + category + metadata
        ↓
Lead → BusinessProject → Documents
        ↓
Assigned salesperson opens a temporary signed download URL
```

Admin can delete real project documents; salespeople have no upload/delete controls.

The seed script creates demo documents so the document UI is visible immediately after seeding.

## Meta lead linkage

```text
Meta
 ↓
leadgen_id
 ↓
Graph API field_data
 ↓
pageId / adId / formId / campaignId
 ↓
BusinessProject
 ↓
Lead.businessProject
 ↓
Assigned salesperson sees project + documents
```

## Automatic assignment and capacity

There is no per-business five-lead limit. The `dailyLeadLimit` belongs to each salesperson and defaults to 5.

Automatic assignment randomly selects an active salesperson with remaining capacity. Only automatic assignments consume the limit. Admin manual assignment can assign an additional lead even when that salesperson has reached the automatic limit.

## Lead hold schedule

Admin can set an exact start/end date and time on Dashboard:

```text
Start: 17 Sep 2026 10:00 PM
End:   18 Sep 2026 10:00 AM
```

During the window:

- Meta lead is stored immediately.
- `deliveryStatus = HELD`.
- It is not assigned.
- It is not visible in salesperson lead lists.
- It does not create a salesperson notification.
- It does not emit a salesperson `new_lead` event.
- It does not play the new-lead sound.

The backend checks the hold window every 30 seconds. Follow-up reminders are checked hourly using an exact `reminderAt = scheduledAt - 24h` timestamp.

## Notifications and realtime scoping

Notifications are never broadcast to every salesperson.

```text
ADMIN
  -> role:ADMIN socket room
  -> all workspace events

SALES
  -> user:<salesperson-id> socket room
  -> only their assigned events
```

Socket.IO verifies the JWT on connection, so a salesperson cannot manually join the admin room.

The browser uses one shared notification audio instance. Realtime Socket.IO events are the primary delivery path; there is no 5-second `/api/leads?limit=1` polling loop. Events are scoped to the authenticated user/management room.

## Local development

```bash
npm install
npm run seed
npm run dev
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:4000`
Health: `http://localhost:4000/health`

## Demo accounts

- Admin: `admin@leadflow.local` / `Admin@123`
- Manager: `manager@leadflow.local` / `Manager@123`
- Sales: `sales@leadflow.local` / `Sales@123`

## Frontend

- Next.js 16
- React 19
- Tailwind CSS v4
- Lucide React
- Socket.IO client

The frontend uses Tailwind utility classes. `frontend/src/app/globals.css` contains only the Tailwind import.

## Backend

- Express 5
- MongoDB / Mongoose
- Socket.IO with JWT authentication
- Redis / BullMQ infrastructure
- JWT authentication and RBAC
- Winston logging
- AWS S3 presigned upload/download

## Backend environment

```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/leadflow_crm
JWT_SECRET=change-this-in-production
JWT_EXPIRES_IN=1d
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://127.0.0.1:6379
META_VERIFY_TOKEN=change-this-webhook-token
META_APP_SECRET=
META_ACCESS_TOKEN=
META_GRAPH_VERSION=
META_LEAD_FETCH_URL=
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-private-bucket
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_PRESIGN_EXPIRES=900
```

## Frontend environment

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

## AWS S3 CORS

The S3 bucket must allow the frontend origin to perform signed `PUT` uploads with `Content-Type`. Keep the bucket private and use the backend's signed GET endpoint for document access.

## Production deployment

```text
Vercel
  -> Next.js frontend

Long-running Node host
  -> Express + Socket.IO API
  -> Meta webhook
  -> lead release worker/scheduler

Managed MongoDB
Managed Redis
Private AWS S3 bucket
```

Do not expose Meta tokens, AWS secrets or JWT secrets through `NEXT_PUBLIC_*` variables.

For production multi-business Meta onboarding, replace the prototype global `META_ACCESS_TOKEN` with per-connection/page credentials selected from the webhook's originating `page_id`.


