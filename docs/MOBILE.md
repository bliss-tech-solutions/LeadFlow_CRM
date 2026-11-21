# LeadFlow mobile apps

One Expo project (`mobile/`) builds **two separate store apps** on the same backend as the website:

| App | Who | Bundle ID | Deep-link scheme |
|---|---|---|---|
| **LeadFlow Partner** | Business owners & sales staff | `com.leadflow.partner` | `leadflow://` |
| **LeadFlow Admin** | Admins & managers | `com.leadflow.admin` | `leadflow-admin://` |

Stack:
- Expo SDK 58, React Native 0.88 and Expo Router (the `src/apps/<variant>` route tree).
- NativeWind 4 with Tailwind 3.4.
- TanStack Query, with an offline cache and an outbox that queues actions while offline.
- Zustand, Socket.IO, expo-notifications, expo-secure-store and expo-local-authentication.

## Security model

1. **Each app is locked to its roles on the server.**
   - At login, `client: "admin-app"` accepts only ADMIN and MANAGER; `client: "partner-app"` accepts only BUSINESS and SALES. Anyone else gets `WRONG_APP`.
   - Access tokens carry the app claim, and every request rejects a token whose role doesn't match its app.
2. **Short-lived tokens.**
   - Access tokens last 15 minutes and are held only in memory.
   - Refresh tokens last 60 days, are stored in the Keychain or Keystore (`expo-secure-store`), and rotate on every use.
   - Re-using an old refresh token revokes the whole session, because it means the token was stolen.
3. **Revocation is immediate.**
   - Blocking a user, changing or resetting a password, and "sign out of all devices" revoke every mobile session and disable push tokens.
   - Users can see and remove their devices in Settings → Signed-in devices.
4. **Data scope is unchanged.** Every API call goes through the same tenant checks as the website: `visibleLeadFilter`, `canAccessLead`, `roles()` and the tenant helpers. Hiding things in the UI (`useCan`, `RequireRole`) is only convenience.
5. **Admin screens never ship in the Partner app.** Expo Router's `root` points at the variant's own route folder, and CI fails if admin screens appear in the Partner bundle.
6. **Optional app lock.** Face ID or fingerprint, asked again after 60 seconds in the background.
7. **Forced updates and maintenance mode** come from `GET /api/app/config`, controlled by the `APP_MIN_VERSION_*` and `APP_MAINTENANCE` env variables.

## Features

| Area | Partner (BUSINESS) | Partner (SALES) | Admin |
|---|---|---|---|
| Today / Dashboard | KPIs, overdue, uncontacted, SLA | My Day | Platform KPIs, hold window, capacity |
| Leads | All business leads: filters, saved quick chips, bulk status/assign/tag, new lead | Own leads, new lead, bulk status/tag | All leads, filter by business, assign |
| Lead detail | Call → "How did it go?" sheet, WhatsApp, status (lost reason / deal value), notes, follow-ups, documents, timeline | Same, without assigning | Same, without WhatsApp sending (history only) |
| Pipeline | Long-press a card to move it | Own leads | All leads |
| Follow-ups | Week agenda, pending and completed lists; complete, reschedule, cancel | Same | Same |
| WhatsApp | Status, templates (including the 3 ready-made ones), automation settings, outbox | Composer only, if the owner allows it | Connection overview (Platform) |
| Analytics | Trends, funnel, sources, lost reasons, leaderboard | My performance | Everything, filterable by business |
| Projects | Units and documents (upload, open, delete) | Assigned projects (read only) | Via Businesses |
| Team | Add, block, assign projects | — | Plus daily limits |
| Admin only | — | — | Businesses (create, quotas, owner login, projects with Meta forms), webhook log with replay, audit log, Meta setup and test lead |
| Everyone | Notifications inbox, push preferences, devices, password, biometrics, dark mode | Same | Same |

Linking WhatsApp (scanning the QR code) stays on the website. The apps send through the business's already-linked number using the server queue, so daily limits and permissions always apply.

## Push notifications

The backend hooks every stored `Notification` (see `backend/src/models/Notification.ts`) to send an Expo push. Each push:
- respects the user's per-category preferences;
- goes only to the app that matches the user's role;
- carries a safe in-app deep link (`/leads/:id`, `/notifications`, …).

Expo push receipts are checked every 15 minutes, and tokens of uninstalled apps are disabled. Android channels are `leads` (max importance), `reminders` and `system`. SLA alerts and reminders use iOS time-sensitive delivery.

Events that trigger a push:
- new or released leads;
- assignments;
- follow-up reminders 24 hours and 15 minutes before;
- SLA warnings and escalations;
- @mentions;
- WhatsApp failures and logouts;
- unassigned-lead alerts for admins.

> Push needs a **development build or store build** on a physical device. Expo Go on Android doesn't support remote push since SDK 53.

## Local development

```bash
cd mobile
cp .env.example .env              # set EXPO_PUBLIC_API_URL to your backend, e.g. http://192.168.1.10:4000/api
npm install
npm run start:partner             # or: npm run start:admin
npm run android:partner           # build & run a development build on an emulator/device
```

On a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP address. On the Android emulator, use `http://10.0.2.2:4000/api`.

Checks (also run in CI):

```bash
npm run typecheck
APP_VARIANT=partner npx expo-doctor && APP_VARIANT=admin npx expo-doctor
npm run export:partner && npm run export:admin
```

## Building for the stores (EAS)

1. Run `npx eas-cli@latest login`, then `npx eas-cli init` **once per app**. Put the two project IDs in `.env` / EAS secrets as `EAS_PROJECT_ID_PARTNER` and `EAS_PROJECT_ID_ADMIN`. Push tokens and over-the-air updates need them.
2. Set up push credentials:
   - Android: upload the FCM v1 service-account key in EAS (`eas credentials`).
   - iOS: EAS creates the APNs key automatically with an Apple Developer account.
3. Build:
   ```bash
   npx eas-cli build --profile partner-preview --platform android   # internal APK for testing
   npx eas-cli build --profile partner-production --platform all
   npx eas-cli build --profile admin-production --platform all
   npx eas-cli submit --profile partner-production --platform all
   ```
4. Send over-the-air JavaScript fixes with `npx eas-cli update --channel partner-production`.
5. Replace `assets/icon.png`, `assets/splash-icon.png` and the Android adaptive icons with real artwork, ideally one set per app.

## Release checklist

- [ ] Backend deployed with the mobile changes. Run it as **one always-on instance**; WhatsApp and realtime need it.
- [ ] `APP_MIN_VERSION_*` and `APP_LATEST_VERSION_*` set, plus store URLs once the apps are published.
- [ ] Push tested on a real Android and iPhone: send a test from Settings → Notifications.
- [ ] Wrong-app login refused: try an admin account in Partner and a salesperson in Admin.
- [ ] Offline: log a call in airplane mode, reconnect, and confirm it syncs.
- [ ] Dark mode and the largest font size look right.
