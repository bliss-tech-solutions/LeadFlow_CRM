# SMS templates for DLT registration

Drafts to submit on the DLT portal (Jio / Airtel / Vi), then add to MSG91.

**Before submitting, replace:**
- `[PHONE]` – your office number (fixed text, e.g. 98XXXXXXXX)
- `[BRAND]` – your approved header / brand name (e.g. LDFLOW or SRS Avenue)

**Rules these follow**
- Only **one** variable per message: the lead's name. The CRM fills only the name (`name` / `first_name`), so everything else is fixed text.
- Type: **Service Explicit** (leads gave consent through the form, so it reaches DND numbers at any time).
- Each one is under 160 characters, so it's billed as 1 SMS.

| # | Use | DLT portal text (submit this) | MSG91 template text (after approval) |
|---|-----|------|------|
| 1 | Welcome: new lead | Dear {#var#}, thank you for your enquiry about SRS Avenue. Our property advisor will call you shortly. For help call [PHONE]. - [BRAND] | Dear ##first_name##, thank you for your enquiry about SRS Avenue. Our property advisor will call you shortly. For help call [PHONE]. - [BRAND] |
| 2 | Call not answered | Dear {#var#}, we tried to reach you about your SRS Avenue enquiry. Please call us at [PHONE] at your convenience. - [BRAND] | Dear ##first_name##, we tried to reach you about your SRS Avenue enquiry. Please call us at [PHONE] at your convenience. - [BRAND] |
| 3 | Site visit reminder | Dear {#var#}, this is a reminder of your SRS Avenue site visit. For directions or to reschedule, call [PHONE]. - [BRAND] | Dear ##first_name##, this is a reminder of your SRS Avenue site visit. For directions or to reschedule, call [PHONE]. - [BRAND] |
| 4 | After site visit | Dear {#var#}, thank you for visiting SRS Avenue. For pricing, floor plans or booking details, call us at [PHONE]. - [BRAND] | Dear ##first_name##, thank you for visiting SRS Avenue. For pricing, floor plans or booking details, call us at [PHONE]. - [BRAND] |

## After approval
1. Note each **DLT Template ID** (19 digits) next to its row.
2. In MSG91 → SMS → Templates → Create Template, paste the MSG91 text and the DLT Template ID.
3. In the CRM (Contact Data → SMS & WhatsApp setup → Templates), add each template with its MSG91 template ID.
