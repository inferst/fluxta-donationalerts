import { describe, expect, it } from "vitest";

import { isEditorMessage, isPluginMessage } from "./messages";

describe("isEditorMessage", () => {
  it("accepts every well-formed editor message", () => {
    expect(isEditorMessage({ event: "get-status" })).toBe(true);
    expect(isEditorMessage({ event: "sign-in" })).toBe(true);
    expect(isEditorMessage({ event: "cancel-sign-in" })).toBe(true);
    expect(isEditorMessage({ event: "sign-out" })).toBe(true);
  });

  it("refuses a malformed or unknown message", () => {
    expect(isEditorMessage(null)).toBe(false);
    expect(isEditorMessage("sign-in")).toBe(false);
    expect(isEditorMessage({ event: "launch" })).toBe(false);
  });
});

describe("isPluginMessage", () => {
  it("accepts every Account state", () => {
    for (const account of [
      { status: "signed-out" },
      { status: "signed-out", problem: "Port 29361 is in use." },
      { status: "signing-in", authorizeUrl: "https://example.com" },
      {
        status: "signed-in",
        name: "MikeRime",
        avatar: "https://example.com/a.png",
        expiresAt: 1_800_000_000_000,
      },
    ]) {
      expect(isPluginMessage({ event: "status", status: { account } })).toBe(
        true,
      );
    }
  });

  it("accepts every Realtime Connection state", () => {
    const account = {
      status: "signed-in",
      name: "MikeRime",
      avatar: "",
      expiresAt: 1_800_000_000_000,
    };
    for (const realtime of [
      { status: "connecting" },
      { status: "connected" },
      { status: "reconnecting", reason: "connection closed" },
      {
        status: "stopped",
        reason: "DonationAlerts no longer accepts this sign-in",
      },
    ]) {
      expect(
        isPluginMessage({ event: "status", status: { account, realtime } }),
      ).toBe(true);
    }
  });

  it("refuses anything else", () => {
    expect(isPluginMessage({ event: "status", status: {} })).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: { account: { status: "signed-in", name: "MikeRime" } },
      }),
    ).toBe(false);
    expect(
      isPluginMessage({
        event: "status",
        status: {
          account: { status: "signed-out" },
          realtime: { status: "reconnecting" },
        },
      }),
    ).toBe(false);
    expect(isPluginMessage({ event: "chats" })).toBe(false);
  });
});
