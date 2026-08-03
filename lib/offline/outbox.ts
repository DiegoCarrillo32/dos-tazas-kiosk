import { cartItemsToRpcItems, getLocationId } from "@/lib/queries";
import type { ClientCharge } from "@/lib/pricing";
import {
  deleteOutboxEntry,
  getAllOutboxEntries,
  getDeviceId,
  getOutboxEntry,
  nextSeq,
  putOutboxEntry,
  readMeta,
  updateOutboxEntry,
  writeMeta,
} from "./db";
import type {
  EnqueueCartInput,
  OfflineOrderSnapshot,
  OfflinePaymentPayload,
  OutboxEntry,
} from "./types";

// ─── Change notifications ───────────────────────────────────────────
//
// A plain pub/sub rather than useSyncExternalStore: IndexedDB reads are
// async and useSyncExternalStore needs a synchronous snapshot, so
// useOutbox (see useOutbox.ts) just re-reads the store on notify().

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const l of listeners) l();
}

/** Cross-tab: another tab's drain or enqueue should refresh this tab's UI. */
let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("dostazas-outbox");
    channel.onmessage = () => notify();
  }
  return channel;
}

function announce() {
  notify();
  getChannel()?.postMessage({ type: "changed", at: Date.now() });
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Deterministic from the client_uuid, so a reprint always shows the same ref. */
export function offlineRefFor(id: string): string {
  return "OFF-" + id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

/**
 * The location to stamp a NEW outbox entry with, and what
 * lib/offline/sync.ts checks a queued entry against before draining it.
 * IndexedDB's `meta` store is the source (not a React Query cache read)
 * because this must work with no network at all — `writeMeta` is called
 * by `useSwitchLocation` (lib/hooks.ts) on every switch, so the cache is
 * kept warm without this function ever needing to be network-dependent
 * itself. Falls back to a live profile read (and backfills the cache)
 * only for a device that has never switched locations since Phase 3
 * shipped — the common case today.
 */
export async function getActiveLocationId(): Promise<string | null> {
  try {
    const cached = await readMeta<string>("activeLocationId");
    if (cached) return cached;
  } catch {
    // IndexedDB unavailable — fall through to the network path.
  }
  try {
    const loc = await getLocationId();
    await writeMeta("activeLocationId", loc).catch(() => {});
    return loc;
  } catch {
    return null;
  }
}

function buildSnapshot(input: EnqueueCartInput): OfflineOrderSnapshot {
  const lines = input.cartItems.map((item) => ({
    name: item.menuItem.name,
    quantity: item.quantity,
    modifiers: item.selectedModifiers.map((m) => m.option.name),
  }));
  const totalAmount = input.cartItems.reduce((sum, item) => {
    const extra = item.selectedModifiers.reduce((s, m) => s + Number(m.option.extra_price), 0);
    return sum + (Number(item.menuItem.price) + extra) * item.quantity;
  }, 0);
  return {
    offlineRef: "", // filled in by the caller once the id is known
    tableName: input.tableName,
    itemCount: input.cartItems.reduce((s, i) => s + i.quantity, 0),
    lines,
    totalAmount,
    currency: input.currency,
  };
}

async function baseEntry(kind: OutboxEntry["kind"]): Promise<
  Pick<
    OutboxEntry,
    | "id"
    | "seq"
    | "kind"
    | "status"
    | "attempts"
    | "nextAttemptAt"
    | "queuedAtEpochMs"
    | "occurredAtIso"
    | "offlineRef"
    | "deviceId"
    | "locationId"
    | "serverOrderId"
    | "expectedShiftId"
    | "lastError"
    | "lastErrorCode"
    | "result"
  >
> {
  const id = crypto.randomUUID();
  const [seq, deviceId, locationId] = await Promise.all([
    nextSeq(),
    getDeviceId(),
    getActiveLocationId(),
  ]);
  const now = Date.now();
  return {
    id,
    seq,
    kind,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    queuedAtEpochMs: now,
    occurredAtIso: new Date(now).toISOString(),
    offlineRef: offlineRefFor(id),
    deviceId,
    locationId,
    serverOrderId: null,
    expectedShiftId: null,
    lastError: null,
    lastErrorCode: null,
    result: null,
  };
}

// ─── Enqueue ─────────────────────────────────────────────────────────

/** A cart built offline, parked (no payment yet). */
export async function enqueuePark(
  input: EnqueueCartInput,
  expectedShiftId: string | null
): Promise<OutboxEntry> {
  const base = await baseEntry("create_order");
  const snapshot = buildSnapshot(input);
  snapshot.offlineRef = base.offlineRef;
  const entry: OutboxEntry = {
    ...base,
    expectedShiftId,
    items: cartItemsToRpcItems(input.cartItems),
    tableId: input.tableId,
    snapshot,
  };
  await putOutboxEntry(entry);
  announce();
  return entry;
}

/**
 * Promote a still-pending `create_order` entry to `create_and_pay` in
 * place — same `id`, therefore the same `client_uuid`, therefore still
 * exactly one server order. Far safer than enqueuing a second entry that
 * points at a not-yet-synced local order. Returns null if the entry isn't
 * `pending` anymore (the sync engine may have already picked it up).
 */
export async function attachPayment(
  entryId: string,
  payment: OfflinePaymentPayload,
  clientCharge: ClientCharge,
  expectedShiftId: string | null
): Promise<OutboxEntry | null> {
  const updated = await updateOutboxEntry(entryId, (entry) => {
    if (entry.status !== "pending") return null;
    return {
      ...entry,
      kind: "create_and_pay",
      payment,
      clientCharge,
      expectedShiftId,
      snapshot: { ...entry.snapshot, totalAmount: clientCharge.totalAmount },
    };
  });
  if (updated) announce();
  return updated;
}

/** Payment for an order that already exists on the server, queued while offline. */
export async function enqueuePaymentForServerOrder(
  serverOrderId: string,
  payment: OfflinePaymentPayload,
  clientCharge: ClientCharge,
  snapshot: OfflineOrderSnapshot,
  expectedShiftId: string | null
): Promise<OutboxEntry> {
  const base = await baseEntry("pay_order");
  const entry: OutboxEntry = {
    ...base,
    serverOrderId,
    expectedShiftId,
    payment,
    clientCharge,
    snapshot: { ...snapshot, offlineRef: base.offlineRef, totalAmount: clientCharge.totalAmount },
  };
  await putOutboxEntry(entry);
  announce();
  return entry;
}

export async function enqueueOpenShift(openingFloat: number): Promise<OutboxEntry> {
  const base = await baseEntry("open_shift");
  const entry: OutboxEntry = {
    ...base,
    openingFloat,
    snapshot: {
      offlineRef: base.offlineRef,
      tableName: null,
      itemCount: 0,
      lines: [],
      totalAmount: 0,
      currency: "CRC",
    },
  };
  await putOutboxEntry(entry);
  announce();
  return entry;
}

/**
 * Discard a purely local entry — nothing was ever sent, no money was
 * taken. Only valid for a still-`pending` `create_order` (never once a
 * payment is attached, and never a `pay_order` against a real server
 * order, which represents money that WAS taken).
 */
export async function discardLocalEntry(entryId: string): Promise<boolean> {
  const entry = await getOutboxEntry(entryId);
  if (!entry || entry.kind !== "create_order" || entry.status !== "pending") return false;
  await deleteOutboxEntry(entryId);
  announce();
  return true;
}

export async function listOutboxEntries(): Promise<OutboxEntry[]> {
  return getAllOutboxEntries();
}

export { announce as announceOutboxChange };
