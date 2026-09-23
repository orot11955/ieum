import { describe, expect, it } from "vitest";
import {
  CalendarTimeError,
  dateAfter,
  localAt,
  resolveLocalTime,
  startOfLocalDate,
  validCalendarDate,
} from "../src/calendar-time.js";

describe("BE-10 calendar local time", () => {
  it("keeps an ordinary Seoul wall time and its UTC instant", () => {
    expect(resolveLocalTime("2024-06-01T09:30:00", "Asia/Seoul")).toEqual({
      at: "2024-06-01T00:30:00.000Z",
      offsetMinutes: 540,
    });
    expect(localAt("2024-06-01T00:30:00.000Z", "America/New_York")).toBe(
      "2024-05-31T20:30:00",
    );
    expect(() =>
      resolveLocalTime("2024-06-01T09:30:00", "+09:00"),
    ).toThrowError(new CalendarTimeError("INVALID_TIME_ZONE"));
  });

  it("rejects the New York spring gap and requires an offset at the fall fold", () => {
    expect(() =>
      resolveLocalTime("2024-03-10T02:30:00", "America/New_York"),
    ).toThrowError(new CalendarTimeError("NONEXISTENT_LOCAL_TIME"));
    expect(() =>
      resolveLocalTime("2024-11-03T01:30:00", "America/New_York"),
    ).toThrowError(new CalendarTimeError("AMBIGUOUS_LOCAL_TIME"));
    expect(
      resolveLocalTime("2024-11-03T01:30:00", "America/New_York", -240).at,
    ).toBe("2024-11-03T05:30:00.000Z");
    expect(
      resolveLocalTime("2024-11-03T01:30:00", "America/New_York", -300).at,
    ).toBe("2024-11-03T06:30:00.000Z");
    expect(() =>
      resolveLocalTime("2024-11-03T01:30:00", "America/New_York", 540),
    ).toThrowError(new CalendarTimeError("OFFSET_MISMATCH"));
  });

  it("uses exclusive all-day bounds across a month and UTC boundary", () => {
    expect(validCalendarDate("2024-02-29")).toBe(true);
    expect(validCalendarDate("2024-02-30")).toBe(false);
    expect(dateAfter("2024-02-29")).toBe("2024-03-01");
    expect(startOfLocalDate("2024-03-01", "Asia/Seoul")).toBe(
      "2024-02-29T15:00:00.000Z",
    );
    expect(startOfLocalDate("2024-03-10", "America/New_York")).toBe(
      "2024-03-10T05:00:00.000Z",
    );
    expect(startOfLocalDate("2024-03-11", "America/New_York")).toBe(
      "2024-03-11T04:00:00.000Z",
    );
  });
});
