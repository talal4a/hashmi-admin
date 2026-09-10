import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatLongDate,
  formatNumber,
  formatPKR,
  formatPercent,
  formatRelative,
  formatShortDate,
  initials,
  truncate,
} from "@/lib/utils/format";

/**
 * These formatters are deliberately not locale-dependent: Node and the browser
 * ship different ICU builds, and a differing separator between the two produces
 * a React hydration mismatch. The assertions below pin the exact output so a
 * regression back to `Intl` locale formatting fails here.
 */
describe("formatPKR", () => {
  it("formats with a plain ASCII space and grouped digits", () => {
    expect(formatPKR(24310)).toBe("Rs 24,310");
    expect(formatPKR(0)).toBe("Rs 0");
    expect(formatPKR(1_234_567)).toBe("Rs 1,234,567");
  });

  it("uses no non-breaking or narrow space", () => {
    const output = formatPKR(1500);
    expect(output).not.toMatch(/[  ]/);
    expect(output.charCodeAt(2)).toBe(32);
  });

  it("rounds to whole rupees by default and to paisa when precise", () => {
    expect(formatPKR(120.4)).toBe("Rs 120");
    expect(formatPKR(120.4, true)).toBe("Rs 120.40");
  });

  it("handles negatives and missing values", () => {
    expect(formatPKR(-250)).toBe("-Rs 250");
    expect(formatPKR(null)).toBe("—");
    expect(formatPKR(undefined)).toBe("—");
    expect(formatPKR(Number.NaN)).toBe("—");
  });
});

describe("formatNumber and formatPercent", () => {
  it("groups digits", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(null)).toBe("—");
  });

  it("formats percentages to a fixed precision", () => {
    expect(formatPercent(13.666)).toBe("13.7%");
    expect(formatPercent(50, 0)).toBe("50%");
  });
});

describe("dates", () => {
  const iso = "2026-09-10T17:45:00.000Z";

  it("formats a stable short date", () => {
    expect(formatDate("2026-09-10T12:00:00.000Z")).toMatch(/^\d{2} [A-Z][a-z]{2} 2026$/);
  });

  it("formats a stable long date", () => {
    expect(formatLongDate(new Date("2026-09-10T12:00:00.000Z"))).toBe(
      "Thursday, 10 September 2026",
    );
  });

  it("formats a short axis label", () => {
    expect(formatShortDate("2026-09-10")).toBe("10 Sep");
  });

  it("includes a 12-hour clock in the long form", () => {
    expect(formatDateTime(iso)).toMatch(/\d{2}:\d{2} (am|pm)$/);
  });

  it("returns an em dash for missing or invalid input", () => {
    for (const value of [null, undefined, "", "not-a-date"]) {
      expect(formatDate(value)).toBe("—");
      expect(formatDateTime(value)).toBe("—");
    }
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-10T12:00:00.000Z").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("collapses the last minute to 'just now'", () => {
    expect(formatRelative(ago(5_000), now)).toBe("just now");
  });

  it("pluralises correctly", () => {
    expect(formatRelative(ago(60_000), now)).toBe("1 minute ago");
    expect(formatRelative(ago(7 * 60_000), now)).toBe("7 minutes ago");
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(formatRelative(ago(2 * 86_400_000), now)).toBe("2 days ago");
  });

  it("handles future timestamps", () => {
    expect(formatRelative(new Date(now + 2 * 3_600_000).toISOString(), now)).toBe("in 2 hours");
  });

  it("falls back to an absolute date beyond a month", () => {
    expect(formatRelative(ago(90 * 86_400_000), now)).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
  });
});

describe("misc helpers", () => {
  it("formats a duration as m:ss", () => {
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(null)).toBe("—");
  });

  it("derives initials from a name", () => {
    expect(initials("Talal Hashmi")).toBe("TH");
    expect(initials("Admin")).toBe("A");
  });

  it("truncates with an ellipsis only when needed", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("a much longer string", 8)).toBe("a much …");
  });
});
