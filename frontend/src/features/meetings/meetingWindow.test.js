import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeMeetingTab, isMeetingTab } from "./meetingWindow";

describe("meeting tab lifecycle", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/meetings");
  });

  it("recognizes a meeting tab", () => {
    window.history.replaceState({}, "", "/meetings/1/room?meeting_tab=1");
    expect(isMeetingTab()).toBe(true);
  });

  it("falls back to navigation for a regular tab", () => {
    const fallback = vi.fn();
    closeMeetingTab(fallback);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("closes a meeting tab when the browser allows it", () => {
    window.history.replaceState({}, "", "/meetings/1/room?meeting_tab=1");
    const fallback = vi.fn();
    const close = vi.spyOn(window, "close").mockImplementation(() => {});
    Object.defineProperty(window, "closed", { configurable: true, value: true });

    closeMeetingTab(fallback);

    expect(close).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    close.mockRestore();
  });
});
