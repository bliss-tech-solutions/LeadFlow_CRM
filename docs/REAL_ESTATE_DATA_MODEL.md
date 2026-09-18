# Real-estate Business Project Data Model

## Stage: Ongoing

Recommended fields:

- Business/project name
- Developer group
- RERA number
- Project status: New Launch / Booking Open / Under Construction / Ready to Move
- Location
- Launch date
- Possession date
- Land area
- Penthouse availability
- Product inventory

## Stage: Upcoming

Recommended fields:

- Business/project name
- Developer group
- RERA number if available
- Product repeat flag
- Estimated RERA tenure
- Location
- Expected launch date
- Expected possession date
- Land/plot area
- Product inventory

## Stage: Completed

Recommended fields:

- Business/project name
- Developer group
- Business type
- Completion year
- Area/location
- RERA number
- Product inventory
- Handover/possession notes

## Product inventory

A project can contain multiple product types. Do not store one `productType` field on the project.

Use:

```text
products[]
  type
  customType
  details{}
```

Supported types in the UI:

- Commercial shop
- Showroom
- Plot
- Office
- Studio
- 1 BHK
- 2 BHK
- 3 BHK
- 4 BHK
- Other

`details` supports product-specific data such as unit count, area, price range, bathrooms, facing and floor range. This keeps the CRM flexible when a developer has inventory that does not fit a rigid schema.

## Meta source mapping

Use an array because one business can have many campaigns/forms:

```text
metaSources[]
  label
  businessId
  pageId
  adAccountId
  campaignId
  adSetId
  adId
  formId
```

For reliable lead matching, at least one of Page ID, Ad ID or Form ID should be present.

## Documents

```text
documents[]
  name
  url
  category
  mimeType
  size
  description
  uploadedBy
  createdAt
```

The document URL should point to S3/R2 or another controlled storage provider. Sales users can see documents through a lead's matched BusinessProject and share them with clients according to future permission rules.
