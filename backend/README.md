# LeadFlow CRM Backend

Express API for authentication, scoped leads, Meta lead ingestion, real-estate projects, S3 documents, follow-ups, notifications, audit events and Socket.IO realtime events.

## Access model

- **ADMIN** — full workspace access, business setup, Meta setup, document upload/delete, hold schedule, salesperson capacity and manual assignment.
- **MANAGER / SALES** — related work only. Leads, follow-ups, notifications and project documents are scoped to assigned/relevant records.
- Socket.IO authenticates the JWT and never trusts a client-supplied role. Only verified ADMIN users join `role:ADMIN`.

## Route map

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Admin/manager or salesperson login |
| GET | `/api/auth/me` | Current authenticated user |
| GET | `/api/users` | Admin-only team list |
| POST | `/api/users` | Admin creates SALES users |
| PATCH | `/api/users/:id/capacity` | Admin changes automatic daily capacity |
| GET | `/api/leads` | Scoped released leads |
| GET | `/api/leads/stats` | Scoped lead funnel stats |
| GET | `/api/leads/:id` | Scoped lead + project + activity + calls + follow-ups |
| PATCH | `/api/leads/:id/status` | Change status on an accessible lead |
| PATCH | `/api/leads/:id/assign` | Admin manual assignment; bypasses automatic capacity |
| POST | `/api/leads/:id/calls` | Log a call on an accessible lead |
| POST | `/api/leads/:id/followups` | Schedule a follow-up on an accessible lead |
| GET | `/api/followups` | Scoped follow-ups |
| GET | `/api/followups/stats` | Scoped follow-up stats |
| PATCH | `/api/followups/:id/complete` | Complete an accessible follow-up |
| GET | `/api/business-projects` | Admin all projects; others only related projects |
| GET | `/api/business-projects/:id` | Admin all projects; others only related projects |
| POST | `/api/business-projects` | Admin creates project |
| PATCH | `/api/business-projects/:id` | Admin updates project |
| POST | `/api/business-projects/uploads/presign` | Admin S3 presign for wizard upload before project creation |
| POST | `/api/business-projects/:id/documents/presign` | Admin S3 presign for existing project |
| POST | `/api/business-projects/:id/documents` | Save S3-uploaded document metadata |
| GET | `/api/business-projects/:id/documents/:documentId/url` | Short-lived document URL for authorized users |
| DELETE | `/api/business-projects/:id/documents/:documentId` | Admin deletes S3 object and project metadata |
| PATCH | `/api/business-projects/:id/assign` | Admin assigns all released project leads |
| GET | `/api/lead-delivery/schedule` | Admin hold configuration |
| PUT | `/api/lead-delivery/schedule` | Admin exact hold window |
| GET | `/api/lead-delivery/capacity` | Admin salesperson capacity |
| POST | `/api/lead-delivery/release` | Admin manual release |
| GET | `/api/notifications` | Current user's notifications |
| PATCH | `/api/notifications/:id/read` | Mark one notification read |
| PATCH | `/api/notifications/read-all` | Mark all read |
| DELETE | `/api/notifications/clear-read` | Remove read notifications |
| GET | `/api/meta/webhook` | Meta webhook verification |
| POST | `/api/meta/webhook` | Public Meta leadgen webhook |
| POST | `/api/meta/test-lead` | Admin-only local Meta-shaped test event |

## BusinessProject

A project contains:

- `name`, `stage`, `developerGroup`, `reraNumber`, `penthouse`
- `products[]` with flexible product-specific `details`
- stage-specific `ongoing`, `upcoming` and `completed` details
- `metaSources[]` for Page / Ad Account / Campaign / Ad Set / Ad / Form mapping
- `documents[]` containing S3 URL, storage key, category and upload metadata
- `metaSetupSkipped`, `documentsSetupSkipped`

One project can contain many product types and many Meta mappings.

## Meta lead linkage

```text
Meta leadgen webhook
 -> leadgen_id
 -> Graph API lead details
 -> source IDs (page/ad/form/campaign)
 -> BusinessProject match
 -> Lead.businessProject
 -> project products + documents available to assigned salesperson
```

## S3 document flow

The browser never asks the admin to paste a storage URL.

```text
Admin selects file
 -> backend presign endpoint
 -> browser PUT directly to S3
 -> backend saves object URL + storageKey + metadata in MongoDB
```

Project documents are private by recommendation. Opening a document creates a short-lived signed GET URL. Admin delete removes the S3 object and the MongoDB document record.

For the four-step project wizard, files are uploaded under a temporary `leadflow/projects/pending/` key before the project record exists. The resulting metadata is attached when the project is created.

### S3 environment

```env
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-private-bucket
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_PRESIGN_EXPIRES=900
```

Configure S3 bucket CORS for the CRM frontend origin and allow browser `PUT` requests with the `Content-Type` header.

## Lead visibility and notifications

The database notification query is always `user=req.user.id`.

Realtime delivery is also scoped:

```text
ADMIN
  -> role:ADMIN room
  -> receives workspace-wide lead/follow-up events

SALES / MANAGER
  -> user:<their-id> room
  -> receives only their assigned lead/follow-up events
```

The client cannot join the admin room because Socket.IO verifies the JWT server-side.

## Automatic salesperson capacity

`dailyLeadLimit` defaults to 5. Only automatic assignments consume this capacity. Admin manual assignment does not consume or enforce the automatic limit.

The assignment service atomically claims an available salesperson before saving an automatic assignment, preventing concurrent webhook requests from intentionally assigning above the configured automatic capacity.

## Lead hold schedule

The schedule is global and Admin-only. It uses exact `holdFrom`, `holdUntil` dates/times and an IANA timezone.

```text
22:00 start
   ↓
new leads = HELD
   ↓
no sales assignment
no sales notification
no sales realtime event
no lead sound
   ↓
10:00 end
   ↓
background release check
   ↓
automatic capacity check
   ↓
assign + notify + Socket.IO
```

The server checks every **30 seconds**, so eligible held leads are normally released within the next minute after the configured end instant. If automatic capacity is full, the lead remains held for a later release attempt; Admin can also manually manage assignment after release.

## Realtime sound

The frontend has one shared audio instance. The browser unlocks it from a user gesture and the Topbar also provides an explicit sound-enable button. Socket and polling paths deduplicate by lead ID, so one lead cannot intentionally trigger two sounds.

## Production notes

The current Meta token is still a global prototype credential. A production multi-business Meta onboarding flow should store per-connection/page credentials server-side and select the correct Page token from the webhook's `page_id`.
