# LeadFlow CRM Architecture

## Modules

```text
frontend/
  Next.js App Router
  Tailwind UI
  Auth portal
  Admin dashboard
  Sales dashboard
  Business Project wizard
  Lead detail + documents
  Follow-up dashboard
  Socket.IO client

backend/
  Express routes
  JWT/RBAC
  MongoDB models
  Meta webhook service
  Business project service/routes
  Lead delivery schedule
  Follow-up service
  Notification service
  Socket.IO
  Redis/BullMQ infrastructure
```

## Main relationships

```text
BusinessProject
  ├── products[]
  ├── metaSources[]
  └── documents[]
          ↑
          │ matched by Meta IDs
          │
Meta leadgen event -> Lead
                      ├── assignedTo -> User(SALES)
                      ├── businessProject -> BusinessProject
                      ├── FollowUp[]
                      ├── Activity[]
                      └── Call[]
```

## Lead lifecycle

```text
RECEIVED
  -> DEDUPLICATED
  -> PROJECT MATCHED
  -> DELIVERY CHECK
       -> HELD
       -> RELEASED
            -> RANDOM SALES ASSIGNMENT
            -> NOTIFICATION
            -> SOCKET.IO new_lead
            -> SALES WORKSPACE
```

## Why state + event history

The `Lead` document stores the current state. `Activity` and `Audit` retain the important history. This lets an admin see who received, assigned, contacted, followed up and changed a lead without relying on a single mutable field.

## Overnight delivery

The delivery schedule is deliberately separate from BusinessProject because the requirement is a CRM-wide delivery window. It is evaluated when each lead arrives and again every minute for release.

## Real-estate project, capacity and lead delivery additions

BusinessProject is the source-of-truth for project context used by incoming Meta leads. It stores stage, products, project-specific Meta source IDs and client-shareable document metadata. A lead can reference BusinessProject through `Lead.businessProject`.

Automatic lead assignment uses the active salesperson pool and each user's `dailyLeadLimit` (default 5). A salesperson is eligible for automatic assignment only while their released assignments for the CRM day are below that limit. Admin/manual assignment intentionally bypasses the automatic capacity check.

Lead delivery uses an exact `holdFrom` → `holdUntil` date/time window. Leads received inside the window are persisted as `HELD`; they are excluded from normal lead queries and are not assigned, notified or emitted through Socket.IO. The backend checks the schedule every 30 seconds. After the end time, held leads are released in order and assigned only to salespeople with available automatic capacity. If capacity is full, the leads remain held until the next release attempt.

Project documents are uploaded through a short-lived AWS S3 pre-signed PUT URL. MongoDB stores document metadata and the S3 key. A protected download endpoint creates a short-lived GET URL for authorized CRM users.
