import { describe, expect, it, vi } from "vitest";
import { copyMeetingLink, getMeetingJoinUrl } from "./meetingLink";

describe("meeting links", () => {
  it("builds a join URL from the current origin", () => {
    expect(getMeetingJoinUrl("abc123")).toBe(`${window.location.origin}/join/abc123`);
  });

  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await expect(copyMeetingLink("abc123")).resolves.toBe(`${window.location.origin}/join/abc123`);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/abc123`);
  });
});
