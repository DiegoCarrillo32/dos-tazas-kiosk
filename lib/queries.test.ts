import { describe, expect, it } from "vitest";
import { csvCell, localDayRangeToUtc } from "./queries";

// Costa Rica (America/Costa_Rica) is UTC-6 year-round, no DST — a fixed,
// simple case to pin the timezone math against.
//
// The bug this guards against (see localDayRangeToUtc's own comment): the
// previous implementation compared `created_at` against bare "YYYY-MM-DD"
// strings, which Postgres reads as UTC midnight. A sale at 23:30 local on
// the last day of a report is 05:30 UTC the NEXT day — a bare-string
// comparison against "next day" would have excluded it from "today's"
// report even though it happened well before local midnight.
describe("localDayRangeToUtc", () => {
  it("bounds a single local day at local midnight, expressed in UTC", () => {
    const { from, to } = localDayRangeToUtc("2026-07-28", "2026-07-28", "America/Costa_Rica");
    // Local midnight (00:00 CR = UTC-6) is 06:00 UTC the same calendar day.
    expect(from).toBe("2026-07-28T06:00:00.000Z");
    // The upper bound is local midnight of the day AFTER endDate.
    expect(to).toBe("2026-07-29T06:00:00.000Z");
  });

  it("spans a multi-day range inclusively, rolling the upper bound into the next month", () => {
    const { from, to } = localDayRangeToUtc("2026-07-01", "2026-07-31", "America/Costa_Rica");
    expect(from).toBe("2026-07-01T06:00:00.000Z");
    expect(to).toBe("2026-08-01T06:00:00.000Z");
  });

  it("includes a sale at 23:30 local on the last day of the range — the exact case the UTC-6 fix targets", () => {
    const { to } = localDayRangeToUtc("2026-07-28", "2026-07-28", "America/Costa_Rica");
    const saleAt2330Local = new Date("2026-07-29T05:30:00.000Z"); // 23:30 on the 28th, Costa Rica time
    expect(saleAt2330Local.toISOString() < to).toBe(true);
  });
});

// Neutralizes spreadsheet formula injection (a cell opening with = + - @ tab
// or CR is executed as a formula by Excel/Sheets on open) and otherwise
// quotes/escapes exactly what CSV requires — see lib/queries.ts's own
// comment on exportOrdersCSV.
describe("csvCell", () => {
  it("passes an ordinary value through unchanged", () => {
    expect(csvCell("Latte")).toBe("Latte");
    expect(csvCell(42)).toBe("42");
  });

  it("renders null and undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it.each(["=SUM(A1:A9)", "+1234", "-1234", "@cmd", "\ttab"])(
    "neutralizes a formula-injection-prone value %j with a leading apostrophe",
    (value) => {
      expect(csvCell(value)).toBe("'" + value);
    }
  );

  it("neutralizes a leading CR AND quotes the cell — \\r triggers both the apostrophe guard and the quoting rule", () => {
    // Unlike tab, \r is also one of the characters that forces quoting
    // (it's a line terminator inside the cell), so both rules apply.
    expect(csvCell("\rcr")).toBe('"\'\rcr"');
  });

  it("wraps and escapes a value containing a comma", () => {
    expect(csvCell("Dos Tazas, San Carlos")).toBe('"Dos Tazas, San Carlos"');
  });

  it("wraps a value containing embedded quotes, doubling them", () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("wraps a value containing a newline", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("applies both the apostrophe guard and quoting when a value needs both", () => {
    // Starts with '=' (formula-injection-prone) AND contains a comma.
    expect(csvCell("=A1,B1")).toBe('"\'=A1,B1"');
  });
});
