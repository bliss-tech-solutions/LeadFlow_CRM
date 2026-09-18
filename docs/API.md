# LeadFlow API Reference

All protected endpoints use:

```text
Authorization: Bearer <JWT>
Content-Type: application/json
```

## Authorization model

- `ADMIN`: full workspace access.
- `MANAGER` and `SALES`: related assigned work only.
- Socket.IO authenticates the same JWT and only ADMIN receives the global admin room.

## Business Projects

### `POST /api/business-projects`

Admin-only. Creates a project from the four-step setup wizard.

The payload can include multiple products and multiple Meta mappings. Documents contain metadata produced after an S3 upload; the frontend does not accept pasted document URLs.

### `POST /api/business-projects/uploads/presign`

Admin-only. Used by the wizard before the project exists.

```json
{
  "name": "brochure.pdf",
  "contentType": "application/pdf",
  "size": 1048576
}
```

Response:

```json
{
  "uploadUrl": "SIGNED_S3_PUT_URL",
  "key": "leadflow/projects/pending/...",
  "objectUrl": "https://..."
}
```

The browser then performs a `PUT` to `uploadUrl`. Only after the PUT succeeds does the frontend add the file to the project payload.

### `POST /api/business-projects/:id/documents/presign`

Admin-only. Same upload flow for an existing project.

### `POST /api/business-projects/:id/documents`

Admin-only. Saves the successful S3 upload metadata:

```json
{
  "name": "Zion Brochure.pdf",
  "url": "https://bucket.s3.../leadflow/projects/...",
  "storageKey": "leadflow/projects/...",
  "category": "BROCHURE",
  "mimeType": "application/pdf",
  "size": 1048576,
  "isDemo": false
}
```

### `GET /api/business-projects/:id/documents/:documentId/url`

Admin can access every project. Other roles can access a project document only when they have a released lead assigned to them for that project. S3 documents return a short-lived signed GET URL.

### `DELETE /api/business-projects/:id/documents/:documentId`

Admin-only. Deletes the S3 object when `storageKey` exists and removes the document from MongoDB. Seeded demo documents are only removed from MongoDB because they are not real S3 objects.

### `PATCH /api/business-projects/:id/assign`

Admin-only. Assigns all currently released leads for the project to one salesperson. This is a manual action and bypasses automatic daily capacity.

## Leads

### `GET /api/leads`

Admin sees all released leads. Other roles see only released leads assigned to their user.

### `GET /api/leads/:id`

Returns:

- Lead
- Assigned salesperson
- Related BusinessProject
- Project products
- Project documents
- Activities
- Calls
- Follow-ups

### `PATCH /api/leads/:id/assign`

Admin-only manual assignment. Manual assignment is not blocked by `dailyLeadLimit`.

## Follow-ups

### `GET /api/followups`

Admin receives all follow-ups. Other roles receive only follow-ups owned by them.

### `GET /api/followups/stats`

Returns pending, completed, missed, cancelled and overdue counts using the same visibility rule as the list.

### `PATCH /api/followups/:id/complete`

The backend rejects a second completion with HTTP `409` and emits a scoped `followup_updated` event to the admin room and the follow-up owner.

## Lead delivery schedule

### `GET /api/lead-delivery/schedule`

Admin-only.

### `PUT /api/lead-delivery/schedule`

Admin-only:

```json
{
  "enabled": true,
  "holdFrom": "2026-09-17T16:30:00.000Z",
  "holdUntil": "2026-09-18T04:30:00.000Z",
  "timezone": "Asia/Kolkata"
}
```

During the exact window, new leads are persisted as `HELD`. They are not assigned, visible to sales, notified to sales or emitted to sales realtime. The server checks every 30 seconds and releases eligible held leads after the end instant.

### `GET /api/lead-delivery/capacity`

Admin-only. Returns each active salesperson's automatic assignments for today, daily limit, remaining capacity and status.

### `PATCH /api/users/:id/capacity`

Admin-only. Changes a salesperson's automatic daily limit.

### `POST /api/lead-delivery/release`

Admin-only. Immediately attempts to release eligible held leads.

## Notifications

### `GET /api/notifications`

Always returns notifications belonging to the authenticated user only.

### `PATCH /api/notifications/:id/read`

Marks one owned notification read.

### `PATCH /api/notifications/read-all`

Marks all owned notifications read.

### `DELETE /api/notifications/clear-read`

Deletes only the authenticated user's read notifications.

## Meta webhook

### `GET /api/meta/webhook`

Handles Meta subscription verification.

### `POST /api/meta/webhook`

```text
Meta
 -> webhook
 -> verify X-Hub-Signature-256 when configured
 -> extract leadgen_id
 -> Graph API fetch
 -> normalize field_data
 -> match BusinessProject source IDs
 -> apply global hold schedule
 -> save Lead
 -> automatic capacity-aware assignment
 -> scoped notification
 -> scoped Socket.IO event
```

### `POST /api/meta/test-lead`

Admin-only local test endpoint. It creates a Meta-shaped payload with a unique `leadgen_id` and skips Graph API retrieval.
