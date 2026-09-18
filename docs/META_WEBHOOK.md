# Meta Lead Webhook Flow

## Payload entry point

The backend accepts the standard leadgen structure:

```json
{
  "entry": [
    {
      "changes": [
        {
          "field": "leadgen",
          "value": {
            "leadgen_id": "...",
            "page_id": "...",
            "form_id": "...",
            "ad_id": "...",
            "adgroup_id": "..."
          }
        }
      ]
    }
  ]
}
```

The local test route creates the same shape automatically. It does not call Meta Graph API.

## Processing

1. Verify the webhook challenge on `GET /api/meta/webhook`.
2. Verify `X-Hub-Signature-256` when `META_APP_SECRET` is configured.
3. Extract `leadgen_id` from supported payload shapes.
4. Fetch complete lead details from Graph API when a server-side access token/version is configured.
5. Normalize `field_data` into the flexible `Lead.meta.fieldData` array.
6. Deduplicate using unique `Lead.metaLeadId`.
7. Match Page ID, Ad ID or Form ID against `BusinessProject.metaSources`.
8. Evaluate the global lead delivery schedule.
9. Save as `RELEASED` or `HELD`.
10. If released, randomly select an active SALES user.
11. Create notifications for admin/manager/assigned salesperson.
12. Emit `new_lead` and `lead_assigned`.
13. If held, do not emit or notify until release.

## Multi-business design

The CRM should not create a separate Lead collection per business. Every lead remains in one `Lead` collection and carries its project/source mapping. This makes cross-business admin reporting straightforward while preserving project-level document access.

## Production token architecture

The current MVP has `META_ACCESS_TOKEN` as a server-side global token. For multiple Meta businesses/pages, the next production phase should add a Meta connection collection with encrypted per-asset/page credentials. The webhook should select the originating Page token from `page_id` before fetching the lead.
