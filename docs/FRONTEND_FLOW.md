# Frontend Flow

## Admin

```text
Login
 -> Dashboard
    -> Lead funnel
    -> Follow-up stats
    -> Global overnight lead delivery schedule
 -> Business Projects
    -> Select Ongoing / Upcoming / Completed
    -> Project details + multiple products
    -> Meta IDs or Skip
    -> Documents or Skip
 -> Leads
 -> Follow-ups
 -> Sales Team
 -> Audit
 -> Meta Setup
```

## Sales

```text
Login
 -> Dashboard
 -> Released assigned Leads
 -> Lead detail
    -> Project information
    -> Client-shareable documents
    -> Meta source
    -> Calls
    -> Schedule follow-up
    -> Timeline
 -> Follow-ups
```

## Realtime

```text
Socket.IO new_lead
   -> Toast
   -> notification refresh
   -> one sound only after lead-ID deduplication

Socket.IO followup_updated
   -> dashboard/follow-up refresh
   -> no lead sound
```

## Responsive behavior

The sidebar is 68px/icon-only below the `md` breakpoint and expands to the full navigation from `md` upward. Tables use horizontal overflow on narrow screens and all new screens use Tailwind responsive utilities.

## Business project detail

`/business` lists projects. Selecting `View details` opens `/business/:id`, where Admin/Manager can review stage information, products, Meta mappings and project documents. Documents can be uploaded directly from the detail page using the S3 pre-signed upload flow.

## Lead project documents

`/leads/:id` reads `lead.businessProject.documents`. Real uploaded documents are opened by first requesting an authenticated short-lived download URL from the backend. When a project has no uploaded files, the UI shows clearly labelled demo placeholders instead of pretending that a file exists.

## Dashboard delivery control

The dashboard contains the exact lead-hold date/time controls and the salesperson capacity table. The dashboard's right content area is independently scrollable while the left sidebar remains fixed. New leads are not exposed while held. Once released, Socket.IO updates the workspace and the existing single-event sound/deduplication logic prevents duplicate sounds for one lead.
