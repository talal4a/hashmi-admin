/** PKR currency, dates and small display helpers used across the admin. */

/**
 * Currency and dates are formatted deterministically rather than through
 * locale-dependent `Intl` output.
 *
 * Node and the browser ship different ICU builds, so the same call can produce a
 * different separator or space character on the server than on the client —
 * which surfaces as a React hydration mismatch. Only digit grouping is taken
 * from `Intl` (stable across builds); everything around it is assembled here.
 */

const GROUPED = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const GROUPED_PRECISE = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPKR(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const magnitude = (precise ? GROUPED_PRECISE : GROUPED).format(Math.abs(value));
  return `${value < 0 ? "-" : ""}Rs ${magnitude}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return GROUPED.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (value: number) => String(value).padStart(2, "0");

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hours = d.getHours();
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${formatDate(iso)}, ${pad(hour12)}:${pad(d.getMinutes())} ${suffix}`;
}

/** Long form used in page headers, e.g. "Thursday, 10 September 2026". */
export function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** Short axis label, e.g. "10 Sep". */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";

  const seconds = Math.round((now - t) / 1000);
  const abs = Math.abs(seconds);
  const past = seconds >= 0;
  const phrase = (value: number, unit: string) => {
    const plural = `${value} ${unit}${value === 1 ? "" : "s"}`;
    return past ? `${plural} ago` : `in ${plural}`;
  };

  if (abs < 45) return past ? "just now" : "in a moment";
  if (abs < 3600) return phrase(Math.round(abs / 60), "minute");
  if (abs < 86400) return phrase(Math.round(abs / 3600), "hour");
  if (abs < 2592000) return phrase(Math.round(abs / 86400), "day");
  return formatDate(iso);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Search tokens stored on the product so list search stays server-backed. */
export function buildSearchTokens(...parts: (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    const clean = part.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
    for (const word of clean.split(/\s+/)) {
      if (word.length < 2) continue;
      tokens.add(word);
      // prefixes so "mil" matches "milk" without a full-text service
      for (let i = 2; i < Math.min(word.length, 12); i++) tokens.add(word.slice(0, i));
    }
  }
  return Array.from(tokens).slice(0, 200);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
