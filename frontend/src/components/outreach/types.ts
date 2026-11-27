export type Channel = "SMS" | "WHATSAPP";

export type ContactRow = {
  _id: string;
  kind: "LEAD" | "CONTACT";
  name: string;
  phone: string;
  createdAt: string;
};

export type Recipient = { kind: ContactRow["kind"]; id: string; name: string; phone: string };

export type Template = {
  _id: string;
  name: string;
  channel: Channel;
  body: string;
  providerTemplateId?: string;
  dltTemplateId?: string;
};

/** Session id of LeadFlow's own messaging WhatsApp (matches the backend). */
export const OUTREACH_WA_ID = "000000000000000000000001";

export type OutreachConfig = {
  channels: Record<Channel, boolean>;
  whatsappConnected: boolean;
  variables: { key: string; label: string }[];
};

export const CHANNEL_LABEL: Record<Channel, string> = { SMS: "SMS", WHATSAPP: "WhatsApp" };

export const CHANNELS: Channel[] = ["SMS", "WHATSAPP"];

/** Same {{variable}} rendering the server uses, for previews. */
export function renderPreview(body: string, r?: { name?: string } | null) {
  const name = (r?.name || "Rahul Sharma").trim();
  const values: Record<string, string> = { name, first_name: name.split(/\s+/)[0] || "" };
  return String(body || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => values[k.toLowerCase()] ?? "");
}

/** Format stored phone digits cleanly as `+<country> <number>` (e.g. `+91 9876543210`). */
export function formatContactPhone(raw?: string | null, defaultCountryCode = "91"): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return s;

  if (digits.length === 10) return `+${defaultCountryCode} ${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${defaultCountryCode} ${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1)}`;
  if (digits.length > 10) return `+${digits.slice(0, digits.length - 10)} ${digits.slice(-10)}`;
  return `+${digits}`;
}
