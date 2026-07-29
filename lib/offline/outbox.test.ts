import { describe, expect, it, vi } from "vitest";
import type { ClientCharge } from "@/lib/pricing";
import type { OfflinePaymentPayload, OutboxEntry } from "./types";

// `updateOutboxEntry` is IndexedDB-backed (see lib/offline/db.ts) — there's
// no IndexedDB in this test environment, and the thing actually worth
// pinning down is attachPayment's OWN guard logic (the mutate callback it
// builds), not the storage plumbing. Mocking db.ts's read-modify-write down
// to "apply the callback to a fixture entry" exercises exactly that.
// vitest hoists vi.mock calls above the imports below, so this runs first.
const updateOutboxEntryMock = vi.fn();
vi.mock("./db", () => ({
  updateOutboxEntry: (id: string, mutate: (e: unknown) => unknown) => updateOutboxEntryMock(id, mutate),
}));

const { attachPayment, offlineRefFor } = await import("./outbox");

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: "entry-1",
    seq: 1,
    kind: "create_order",
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
    queuedAtEpochMs: Date.now(),
    occurredAtIso: new Date().toISOString(),
    offlineRef: "OFF-AAAA",
    deviceId: "device-1",
    serverOrderId: null,
    expectedShiftId: null,
    snapshot: {
      offlineRef: "OFF-AAAA",
      tableName: null,
      itemCount: 1,
      lines: [{ name: "Latte", quantity: 1, modifiers: [] }],
      totalAmount: 1500,
      currency: "CRC",
    },
    lastError: null,
    lastErrorCode: null,
    result: null,
    ...overrides,
  };
}

const payment: OfflinePaymentPayload = {
  payment_method: "cash",
  payment_reference: null,
  tip_amount: 0,
  amount_tendered: 2000,
  customer_name: null,
  customer_id: null,
  customer_email: null,
  discount_type: null,
  discount_value: 0,
  discount_reason: null,
};

const clientCharge: ClientCharge = {
  subtotal: 1327,
  taxAmount: 173,
  discountAmount: 0,
  tipAmount: 0,
  totalAmount: 1500,
  amountTendered: 2000,
  changeDue: 500,
  pricingVersion: "test-version",
};

// Deterministic from the client_uuid, so a reprint always shows the same
// ref (see lib/offline/outbox.ts's own comment on this).
describe("offlineRefFor", () => {
  it("derives OFF-XXXX from the first 4 hex chars of the id, uppercased", () => {
    expect(offlineRefFor("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("OFF-A1B2");
  });

  it("is deterministic — same id always produces the same ref", () => {
    const id = "9f8e7d6c-0000-1111-2222-333344445555";
    expect(offlineRefFor(id)).toBe(offlineRefFor(id));
  });

  it("differs for different ids", () => {
    expect(offlineRefFor("aaaaaaaa-0000-0000-0000-000000000000")).not.toBe(
      offlineRefFor("bbbbbbbb-0000-0000-0000-000000000000")
    );
  });
});

// The guard that stops a double-charge: once the sync engine has picked an
// entry up (or it's already synced), attaching a payment to it in place
// must fail loudly (null) rather than silently clobbering an in-flight or
// completed attempt.
describe("attachPayment", () => {
  it("promotes a pending create_order entry to create_and_pay", async () => {
    const entry = makeEntry({ status: "pending" });
    updateOutboxEntryMock.mockImplementation(async (_id: string, mutate: (e: OutboxEntry) => OutboxEntry | null) =>
      mutate(entry)
    );

    const result = await attachPayment(entry.id, payment, clientCharge, "shift-1");

    expect(result).not.toBeNull();
    expect(result?.kind).toBe("create_and_pay");
    expect(result?.payment).toEqual(payment);
    expect(result?.clientCharge).toEqual(clientCharge);
    expect(result?.expectedShiftId).toBe("shift-1");
    // The projected queue row's total should track the payment, not the
    // stale park-time snapshot.
    expect(result?.snapshot.totalAmount).toBe(clientCharge.totalAmount);
  });

  it.each(["inflight", "done", "failed", "blocked"] as const)(
    "returns null when the entry is already %s — the sync engine got there first",
    async (status) => {
      const entry = makeEntry({ status });
      updateOutboxEntryMock.mockImplementation(async (_id: string, mutate: (e: OutboxEntry) => OutboxEntry | null) =>
        mutate(entry)
      );

      const result = await attachPayment(entry.id, payment, clientCharge, null);

      expect(result).toBeNull();
    }
  );
});
