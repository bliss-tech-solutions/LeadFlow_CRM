# WhatsApp integration (QR-linked device)

LeadFlow lets each business link its own WhatsApp number by scanning a QR code, then send leads a personalised project introduction and documents from the Leads list, a lead's detail page, the pipeline board or "My Day". It uses WhatsApp's **Linked devices** feature through the open-source [Baileys](https://github.com/WhiskeySockets/Baileys) library. There is no paid WhatsApp Business API.

## How it works

1. **Business owner** opens **WhatsApp** in the sidebar and clicks **Show QR code**.
2. They scan it from the phone, using WhatsApp → Settings → Linked devices → Link a device.
3. The encrypted session is stored in MongoDB (`whatsappauthkeys`, AES-256-GCM). After a restart or deploy the API reconnects automatically, with no rescan needed.
4. Anyone allowed to message a lead clicks the WhatsApp icon. A drawer opens with:
   - a template, filled in with the lead's name, project, location, prices and so on;
   - an editable message;
   - a checklist of the project's documents.
5. The message is queued. A worker sends one message at a time per business, waiting 4–9 seconds at random between messages. It sends the text first, then each document. Documents are streamed from S3 using short-lived signed URLs.
6. Delivered and read ticks update live on the lead and in the business outbox.

## Who can do what

| Action | Business owner | Sales staff | Admin / Manager |
|---|---|---|---|
| Connect / disconnect the number | ✅ | — | — |
| Manage templates | ✅ | use only | — |
| Send to a lead | ✅ own business's leads | ✅ own assigned leads, if the owner enabled "Sales staff can send WhatsApp" | — |
| See message history on a lead | ✅ | ✅ | ✅ |
| See connection status of every business | — | — | ✅ (Platform Health) |

Every check is enforced on the server (`backend/src/routes/whatsapp.ts`). A user never chooses which business number is used: it is always the business the lead belongs to.

## Safety limits (to protect the number)

| Setting | Default | Meaning |
|---|---|---|
| `WA_DAILY_LIMIT` | 150 | Max messages per business per day (IST) |
| `WA_MIN_GAP_MS` / `WA_MAX_GAP_MS` | 4000 / 9000 | Random gap between messages |
| Duplicate guard | — | Only one queued message per lead at a time |
| Opt-out | — | `whatsappOptOut` on the lead blocks sending |
| Expiry | 24h | Queued messages expire if WhatsApp never reconnects |

> ⚠️ Linked-device automation is not an official WhatsApp API. WhatsApp may restrict numbers that many people report as spam. Use a dedicated WhatsApp Business number, only message people who enquired, and personalise templates.

## Hosting requirements

- **One always-on API instance.** A linked device holds a live WebSocket, and two replicas would fight over the same session.
- **Render free tier:** the instance sleeps and restarts.
  - Sessions reconnect automatically from MongoDB, but messages can wait until the instance wakes up.
  - The 512 MB of RAM fits roughly 5–10 linked businesses.
  - For production, use an always-on plan (for example Render Starter) or a VPS.
- Set `WA_ENCRYPTION_KEY` (32+ random characters) before go-live and never change it. Changing it forces every business to scan the QR again. Production refuses to start without it unless `WA_ENABLED=false`.

## Key files

- `backend/src/services/whatsapp/sessionManager.ts`: one socket per business, QR, reconnect with backoff, receipts.
- `backend/src/services/whatsapp/authState.ts`: encrypted Mongo auth state.
- `backend/src/services/whatsapp/queue.ts`: rate-limited send worker.
- `backend/src/services/whatsapp/template.ts`: `{{variable}}` rendering.
- `backend/src/routes/whatsapp.ts`: REST API.
- `frontend/src/app/(dashboard)/whatsapp/page.tsx`: connection, templates, automation settings and outbox.
- `frontend/src/components/WhatsAppSendDrawer.tsx`: the composer.
