import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyError, isNetworkError } from "./sync";

// classifyError drives the drain loop's retry policy (lib/offline/sync.ts's
// processEntry): get a bucket wrong and a permanent failure retries forever,
// or a transient one gives up on a sale that would have synced fine on the
// next attempt. Pinned against the Postgres/PostgREST codes it actually sees.
describe("classifyError", () => {
  it("classifies a unique_violation as immediate-retry (the RPC's own replay branch should catch it)", () => {
    expect(classifyError({ code: "23505", message: "duplicate key" }).cls).toBe("immediate-retry");
  });

  it.each([
    ["42501", "insufficient_privilege"],
    ["23503", "foreign_key_violation"],
    ["22P02", "invalid_text_representation"],
    ["P0001", "raise_exception"],
  ])("classifies %s as permanent — retrying would never succeed", (code) => {
    expect(classifyError({ code, message: "x" }).cls).toBe("permanent");
  });

  it("classifies PGRST301 (JWT expired) as auth", () => {
    expect(classifyError({ code: "PGRST301", message: "JWT expired" }).cls).toBe("auth");
  });

  it("classifies an invalid_grant/refresh_token message as auth even with no code", () => {
    expect(classifyError({ message: "invalid_grant: refresh token expired" }).cls).toBe("auth");
    expect(classifyError({ message: "AuthApiError: Invalid refresh_token" }).cls).toBe("auth");
  });

  it("falls back to transient for an uncoded network failure", () => {
    const result = classifyError(new TypeError("Failed to fetch"));
    expect(result.cls).toBe("transient");
    expect(result.code).toBeNull();
  });

  it("falls back to transient for a Postgres code it doesn't special-case (e.g. a bare 5xx wrapper)", () => {
    expect(classifyError({ code: "PGRST116", message: "not found" }).cls).toBe("transient");
  });

  it("handles a non-object throw (message becomes the stringified value)", () => {
    const result = classifyError("boom");
    expect(result.cls).toBe("transient");
    expect(result.code).toBeNull();
    expect(result.message).toBe("boom");
  });
});

// isNetworkError is deliberately narrower than classifyError's "transient"
// bucket — see lib/offline/sync.ts's comment on it. Any error that carries a
// Postgres/PostgREST code reached the server and got a considered answer, so
// it must never be treated as "couldn't reach the network" even if the drain
// loop's own classifier would still retry it.
describe("isNetworkError", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("is never true for a coded error, regardless of message", () => {
    expect(isNetworkError({ code: "23505", message: "Failed to fetch" })).toBe(false);
  });

  it("is true when navigator.onLine is false, even with no message", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(isNetworkError({})).toBe(true);
  });

  it.each([
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "network request failed",
    "Load failed",
    "AbortError: The operation was aborted",
  ])("is true for the message %j when navigator says online", (message) => {
    expect(isNetworkError({ message })).toBe(true);
  });

  it("is false for an uncoded error with an unrelated message while online", () => {
    expect(isNetworkError({ message: "Something else went wrong" })).toBe(false);
  });
});
