export const STATES = [
  "Gujarat",
  "Maharashtra",
  "Rajasthan",
  "Madhya Pradesh",
  "Delhi",
  "Karnataka",
  "Uttar Pradesh",
  "Tamil Nadu",
  "Telangana",
  "Haryana",
  "Punjab",
  "West Bengal",
  "Kerala",
  "Goa",
  "Other",
] as const;

export type State = (typeof STATES)[number];

export const GUJARAT_CITIES = [
  "Ahmedabad",
  "Vadodara",
  "Gandhinagar",
  "Surat",
] as const;

export const OTHER_CITIES = [
  "Pune",
  "Mumbai",
  "Rajkot",
  "Bengaluru",
  "Jaipur",
  "Indore",
  "Delhi NCR",
  "Other",
] as const;

export const CITIES = [
  ...GUJARAT_CITIES,
  "Pune",
  "Rajkot",
  "Mumbai",
  "Other",
] as const;

export type City = string;

export const GUJARAT_AREAS: Record<string, string[]> = {
  Ahmedabad: [
    "Bopal",
    "South Bopal",
    "Satellite",
    "Vastrapur",
    "Prahlad Nagar",
    "Bodakdev",
    "Thaltej",
    "Gota",
    "Shela",
    "SG Highway",
    "Navrangpura",
    "Maninagar",
    "Chandkheda",
    "Sindhu Bhavan",
    "Ambli",
    "Nikol",
    "Naroda",
    "Motera",
    "Science City",
    "Other",
  ],
  Vadodara: [
    "Alkapuri",
    "Gotri",
    "Vasna",
    "Vasna-Bhayli Road",
    "Bhayli",
    "Akota",
    "Fatehgunj",
    "Karelibaug",
    "Manjalpur",
    "Atladra",
    "Sevasi",
    "Gorwa",
    "Sayajigunj",
    "Waghodia Road",
    "Harni",
    "Subhanpura",
    "Sama",
    "Other",
  ],
  Gandhinagar: [
    "Kudasan",
    "Raysan",
    "Sargasan",
    "Vavol",
    "Koba",
    "Bhaijipura",
    "Infocity",
    "GIFT City",
    "Sector 1-10",
    "Sector 11-20",
    "Sector 21-30",
    "Urjanagar",
    "Randheja",
    "Chiloda",
    "Other",
  ],
  Surat: [
    "Vesu",
    "Adajan",
    "Pal",
    "Piplod",
    "Ghod Dod Road",
    "Athwa",
    "Althan",
    "Dumas Road",
    "Varachha",
    "Katargam",
    "Jahangirpura",
    "Udhna",
    "City Light",
    "Other",
  ],
};

export const OTHER_AREAS: Record<string, string[]> = {
  Pune: ["Hinjawadi", "Baner", "Kothrud", "Wakad", "Viman Nagar", "Hadapsar", "Kharadi", "Other"],
  Mumbai: ["Bandra", "Andheri", "Borivali", "Powai", "Thane", "Navi Mumbai", "Worli", "Other"],
  Rajkot: ["Kalawad Road", "University Road", "Yagnik Road", "Madhapar", "150 Feet Ring Road", "Other"],
};

export function getCitiesForState(state: string = "Gujarat"): string[] {
  const norm = String(state || "").trim().toLowerCase();
  if (norm === "gujarat" || norm === "gujrat" || norm === "gujrate" || norm.startsWith("guj")) {
    return [...GUJARAT_CITIES];
  }
  return [...OTHER_CITIES];
}

export function getAreasForCity(city: string = ""): string[] {
  if (!city) return ["Other"];
  if (GUJARAT_AREAS[city]) return GUJARAT_AREAS[city];
  if (OTHER_AREAS[city]) return OTHER_AREAS[city];
  return ["Other"];
}
