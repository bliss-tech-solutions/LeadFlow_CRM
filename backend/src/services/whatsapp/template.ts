export type TemplateContext = {
  lead: { name?: string; phone?: string; email?: string };
  project?: {
    name?: string;
    location?: string;
    reraNumber?: string;
    stage?: string;
    products?: { customType?: string; type?: string; priceRange?: string; areaSqFt?: string }[];
  } | null;
  business?: { name?: string; contactNo?: string } | null;
  sender?: { name?: string } | null;
};

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: "name", label: "Lead full name" },
  { key: "first_name", label: "Lead first name" },
  { key: "project", label: "Project name" },
  { key: "location", label: "Project location" },
  { key: "price", label: "Unit types & price ranges" },
  { key: "rera", label: "RERA number" },
  { key: "business", label: "Business name" },
  { key: "business_phone", label: "Business contact number" },
  { key: "sales_name", label: "Your name" },
];

function priceSummary(products?: any[]) {
  if (!Array.isArray(products) || !products.length) return "";
  return products
    .map((p: any) => {
      const label = p.customType || String(p.type || "").replace(/_/g, " ");
      const parts = [label, p.areaSqFt ? `${p.areaSqFt} sq.ft` : "", p.priceRange ? `₹${p.priceRange}` : ""].filter(Boolean);
      return `• ${parts.join(" · ")}`;
    })
    .join("\n");
}

/** Replace {{variable}} placeholders. Unknown variables render as empty strings. */
export function renderTemplate(body: string, ctx: TemplateContext): string {
  const firstName = String(ctx.lead.name || "").trim().split(/\s+/)[0] || "";
  const values: Record<string, string> = {
    name: ctx.lead.name || "",
    first_name: firstName,
    project: ctx.project?.name || "",
    location: ctx.project?.location || "",
    price: priceSummary(ctx.project?.products),
    rera: ctx.project?.reraNumber || "",
    business: ctx.business?.name || "",
    business_phone: ctx.business?.contactNo || "",
    sales_name: ctx.sender?.name || "",
  };
  return String(body || "")
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => values[key.toLowerCase()] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const DEFAULT_TEMPLATE_BODY = `Hi {{first_name}} 👋

Thank you for your interest in *{{project}}* by {{business}}.

📍 Location: {{location}}
{{price}}

I've attached the project details for you. Feel free to reply here with any questions or to book a site visit.

– {{sales_name}}, {{business}}
📞 {{business_phone}}`;

/**
 * Ready-made templates a business owner can adopt with one click (then edit).
 * Until a business creates its own templates, these are offered in the composer.
 */
export const PRESET_TEMPLATES: { key: string; name: string; description: string; body: string }[] = [
  {
    key: "intro",
    name: "Project introduction",
    description: "First message right after the enquiry — warm intro with location, prices and brochure.",
    body: DEFAULT_TEMPLATE_BODY,
  },
  {
    key: "site_visit",
    name: "Site visit invitation",
    description: "Invite an interested lead to see the project in person and pick a time.",
    body: `Hello {{first_name}},

It was great speaking with you about *{{project}}*. 🏡

We'd love to show you around in person:
📍 {{location}}
🕙 Site visits: Mon–Sun, 10 AM – 6 PM

Just reply with a day and time that suits you, and I'll arrange everything — including a pickup if needed.

Warm regards,
{{sales_name}}
{{business}} · 📞 {{business_phone}}`,
  },
  {
    key: "price_followup",
    name: "Price & offer follow-up",
    description: "Follow up with unit options and pricing, with a gentle nudge to take the next step.",
    body: `Hi {{first_name}},

As promised, here are the current options at *{{project}}*:

{{price}}

RERA: {{rera}}

I've attached the price sheet and floor plans for your reference. Prices and availability can change, so let me know if you'd like me to hold a unit or share payment plan details.

Happy to answer any questions here 🙂
– {{sales_name}}, {{business}}`,
  },
];
