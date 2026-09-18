# LeadFlow CRM Frontend

Next.js 16 + React 19 + Tailwind CSS v4 frontend for LeadFlow CRM.

## Pages

- `/login` — portal chooser
- `/admin/login` — admin/manager login entry; ADMIN has full controls
- `/sales/login` — salesperson login
- `/forgot-password` — recovery UI placeholder
- `/dashboard` — scoped lead/follow-up dashboard; ADMIN additionally sees hold schedule and salesperson capacity
- `/leads` — released leads scoped to the authenticated user
- `/leads/:id` — lead details, matched project, client documents, calls, follow-ups and transparency timeline
- `/followups` — scoped follow-up list and statistics
- `/business` — ADMIN project setup; other roles only see related projects when accessible
- `/business/:id` — project details and documents; only ADMIN can upload/delete
- `/team` — ADMIN salesperson management
- `/audit` — ADMIN audit log
- `/integration` — Meta webhook/test page

## Business setup UI flow

```text
Select stage
   -> Project information
      -> Multiple product types + type-specific details
         -> Meta mappings or Skip
            -> Select files directly or Skip
               -> S3 upload
                  -> Create project
```

There is no document URL input. A selected file is uploaded directly to AWS S3 using a backend presigned URL, and the resulting storage metadata is saved with the project.

## Role-scoped UI

```text
ADMIN
  Dashboard controls
  Business projects
  Meta setup
  Team
  Audit
  Hold schedule
  Sales capacity
  Document upload/delete
  All leads/follow-ups/notifications

SALES / MANAGER
  Assigned/related leads
  Own follow-ups
  Related notifications
  Related project documents
```

## Tailwind rule

All application styling uses Tailwind utility classes. `src/app/globals.css` contains only the Tailwind import:

```css
@import "tailwindcss";
```

Do not add application-specific CSS selectors.

## Realtime notifications

Socket.IO is authenticated using the same JWT as the API. The server puts ADMIN into `role:ADMIN` and every user into `user:<id>`. Salespeople therefore cannot receive other salespeople's lead events.

The Topbar has an explicit notification-sound button, and the first dashboard user gesture can also unlock audio for browsers with autoplay restrictions. The shared audio instance and lead-ID deduplication prevent duplicate sound for one lead.

## Lead delivery hold

Only ADMIN can configure the global hold window. The Dashboard accepts exact start/end date and time. Held leads are invisible to sales and are released by the backend every 30 seconds after the end time.

## Salesperson capacity

Only ADMIN can see or edit automatic daily capacity. The default automatic limit is 5 per salesperson. Manual Admin assignment can exceed the automatic limit.

## Project documents

### Existing project

`/business/:id`:

```text
Choose category
   -> Select document
   -> backend presign
   -> browser PUT to S3
   -> backend saves metadata
```

Admin sees delete controls. Sales users only get a temporary signed document URL when the project is related to their assigned lead.

### Wizard

The wizard uses `/api/business-projects/uploads/presign` before the project exists. Files are temporarily stored under `leadflow/projects/pending/`; their metadata is attached when the project is created.

## Environment

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

Never put secrets in `NEXT_PUBLIC_*` variables.
