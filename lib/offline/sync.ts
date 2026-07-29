import type { QueryClient } from "@tanstack/react-query";
import { openShift, syncOfflineOrder, syncOfflinePayment } from "@/lib/queries";
import { getAllOutboxEntries, updateOutboxEntry } from "./db";
import { announceOutboxChange } from "./outbox";
import type { OutboxEntry } from "./types";

/**
 * Module-scope singleton, not a hook — the drain must keep running across
 * navigations and survive no component observing it. React binds to this
 * through useOutbox.ts's subscribe/re-read pattern instead of driving it
 * directly.
 *
 * Not importing lib/hooks.ts's `queryKeys` here on purpose: hooks.ts calls
 * into this module (to kick a drain on realtime reconnect), so importing
 * the reverse direction would create a cycle. The query keys below are
 * duplicated literals rather than a shared export — cheap, and keeps the
 * import graph one-directional.
 */

let qc: QueryClient | null = null;

export function setSyncQueryClient(client: QueryClient) {
  qc = client;
}

function invalidateAfterSync() {
  if (!qc) return;
  qc.invalidateQueries({ queryKey: ["parkedOrders"] });
  qc.invalidateQueries({ queryKey: ["currentShift"] });
  qc.invalidateQueries({ queryKey: ["recentShifts"] });
  qc.invalidateQueries({ queryKey: ["todayAnalytics"] });
  // refetchOnWindowFocus is off (kiosk setting), so a tablet that slept
  // through the outage won't otherwise notice the menu changed underneath
  // it — reconnect is the one moment to force it.
  qc.invalidateQueries({ queryKey: ["categories"] });
  qc.invalidateQueries({ queryKey: ["menuItems"] });
  qc.invalidateQueries({ queryKey: ["modifiers"] });
  qc.invalidateQueries({ queryKey: ["menuItemModifierMap"] });
  qc.invalidateQueries({ queryKey: ["locationSettings"] });
  qc.invalidateQueries({ queryKey: ["tables"] });
}

const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 5 * 60_000;

function backoffDelay(attempts: number): number {
  const raw = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
  const jitter = raw * 0.2 * (Math.random() * 2 - 1);
  return Math.max(1000, raw + jitter);
}

// ─── Error classification ───────────────────────────────────────────

type ErrorClass = "immediate-retry" | "transient" | "permanent" | "auth";

function classifyError(err: unknown): { cls: ErrorClass; code: string | null; message: string } {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? null;
  const message = e?.message ?? String(err);

  // The RPCs already swallow their own unique_violation internally and
  // return a clean replayed:true — this only fires if that ever regresses.
  // Immediate retry (not counted against the attempt budget) because the
  // retry itself will hit the replay branch and succeed.
  if (code === "23505") return { cls: "immediate-retry", code, message };

  if (code === "42501" || code === "23503" || code === "22P02" || code === "P0001") {
    return { cls: "permanent", code, message };
  }

  if (
    code === "PGRST301" ||
    /invalid_grant|refresh_token/i.test(message)
  ) {
    return { cls: "auth", code, message };
  }

  // Everything else — TypeError "Failed to fetch", AbortError, 5xx/429,
  // navigator.onLine false, or an error with no code at all — is treated
  // as transient. navigator.onLine lies constantly (captive portals), so
  // "no discernible reason" defaults to retryable rather than terminal.
  return { cls: "transient", code, message };
}

/**
 * Narrower than the drain engine's own classifier: used by the Floor and
 * Counter pages to decide whether an online mutation that just failed
 * should fall back to the offline queue (rather than just showing the
 * user an error and losing the cart). A real, coded response from
 * PostgREST — even an error — means the request reached the server and
 * got a considered answer, so it's never treated as a network failure
 * here even though the drain engine's broader "transient" bucket would
 * still retry an uncoded 5xx.
 */
export function isNetworkError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code) return false;
  const message = e?.message ?? String(err);
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return /failed to fetch|network ?error|network request failed|load failed|abort ?error/i.test(
    message
  );
}

// ─── Payload builders ────────────────────────────────────────────────

function clientAgeSeconds(entry: OutboxEntry): number {
  return Math.max(0, (Date.now() - entry.queuedAtEpochMs) / 1000);
}

async function runEntry(entry: OutboxEntry): Promise<
  | { ok: true; result: { orderId: string; orderNumber: number | null; status: "parked" | "completed"; discrepancy: number; warnings: unknown[] } }
  | { ok: false; terminal: true; code: string; message: string }
> {
  if (entry.kind === "open_shift") {
    const shiftId = await openShift(entry.openingFloat ?? 0, entry.id);
    return {
      ok: true,
      result: { orderId: shiftId, orderNumber: null, status: "completed", discrepancy: 0, warnings: [] },
    };
  }

  if (entry.kind === "pay_order") {
    if (!entry.serverOrderId || !entry.payment) {
      return { ok: false, terminal: true, code: "malformed_entry", message: "pay_order entry missing order id or payment" };
    }
    const res = await syncOfflinePayment({
      orderId: entry.serverOrderId,
      clientUuid: entry.id,
      clientAgeSeconds: clientAgeSeconds(entry),
      expectedShiftId: entry.expectedShiftId,
      payment: entry.payment,
      clientCharge: entry.clientCharge ?? null,
    });
    if ("conflict" in res) {
      // Money was genuinely taken twice in the real world (two devices
      // paid the same order offline) — say so loudly, never silently.
      return { ok: false, terminal: true, code: `conflict_${res.conflict}`, message: JSON.stringify(res) };
    }
    return {
      ok: true,
      result: {
        orderId: res.order_id,
        orderNumber: res.order_number,
        status: res.status,
        discrepancy: res.discrepancy,
        warnings: res.warnings,
      },
    };
  }

  // create_order / create_and_pay
  if (!entry.items) {
    return { ok: false, terminal: true, code: "malformed_entry", message: "create_order entry missing items" };
  }
  const res = await syncOfflineOrder({
    clientUuid: entry.id,
    items: entry.items,
    offlineRef: entry.offlineRef,
    deviceId: entry.deviceId,
    tableId: entry.tableId ?? null,
    clientAgeSeconds: clientAgeSeconds(entry),
    expectedShiftId: entry.expectedShiftId,
    payment: entry.kind === "create_and_pay" ? entry.payment ?? null : null,
    clientCharge: entry.clientCharge ?? null,
  });
  return {
    ok: true,
    result: {
      orderId: res.order_id,
      orderNumber: res.order_number,
      status: res.status,
      discrepancy: res.discrepancy,
      warnings: res.warnings,
    },
  };
}

async function processEntry(entry: OutboxEntry): Promise<void> {
  const claimed = await updateOutboxEntry(entry.id, (e) =>
    e.status === "pending" ? { ...e, status: "inflight" } : null
  );
  if (!claimed) return; // another tab/attempt already picked it up

  try {
    const outcome = await runEntry(claimed);
    if (outcome.ok) {
      await updateOutboxEntry(entry.id, (e) => ({
        ...e,
        status: "done",
        serverOrderId: e.serverOrderId ?? outcome.result.orderId,
        result: outcome.result,
        lastError: null,
        lastErrorCode: null,
      }));
      invalidateAfterSync();
      return;
    }
    await updateOutboxEntry(entry.id, (e) => ({
      ...e,
      status: "failed",
      lastError: outcome.message,
      lastErrorCode: outcome.code,
    }));
  } catch (err) {
    const { cls, code, message } = classifyError(err);
    if (cls === "immediate-retry") {
      await updateOutboxEntry(entry.id, (e) => ({
        ...e,
        status: "pending",
        nextAttemptAt: Date.now(),
        lastError: message,
        lastErrorCode: code,
      }));
      return;
    }
    if (cls === "permanent" || cls === "auth") {
      await updateOutboxEntry(entry.id, (e) => ({
        ...e,
        status: "failed",
        lastError: message,
        lastErrorCode: cls === "auth" ? "auth_expired" : code,
      }));
      return;
    }
    // transient
    const attempts = claimed.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await updateOutboxEntry(entry.id, (e) => ({
        ...e,
        status: "failed",
        attempts,
        lastError: message,
        lastErrorCode: "max_attempts_exceeded",
      }));
      return;
    }
    await updateOutboxEntry(entry.id, (e) => ({
      ...e,
      status: "pending",
      attempts,
      nextAttemptAt: Date.now() + backoffDelay(attempts),
      lastError: message,
      lastErrorCode: code,
    }));
  }
}

// ─── Drain loop ──────────────────────────────────────────────────────

let draining = false;
let kickTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesced trigger — safe to call as often as you like. */
export function kick() {
  if (kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void drain();
  }, 50);
}

async function drain() {
  if (draining) return;
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    await navigator.locks.request("dostazas-outbox-drain", { ifAvailable: true }, async (lock) => {
      if (!lock) return; // another tab is already draining
      await drainLoop();
    });
  } else {
    await drainLoop();
  }
}

async function drainLoop() {
  draining = true;
  try {
    for (;;) {
      const entries = await getAllOutboxEntries();
      const now = Date.now();
      // Oldest-ready-first: entries are already seq-sorted, so the first
      // match is the strict-FIFO pick among what's currently eligible. A
      // failed/backed-off entry never blocks a later one from draining.
      const next = entries.find((e) => e.status === "pending" && e.nextAttemptAt <= now);
      if (!next) break;
      await processEntry(next);
      announceOutboxChange();
    }
  } finally {
    draining = false;
  }
}

// ─── Retry a single failed entry (manual "Reintentar" in the queue panel) ──

export async function retryEntry(id: string): Promise<void> {
  await updateOutboxEntry(id, (e) =>
    e.status === "failed" ? { ...e, status: "pending", nextAttemptAt: Date.now() } : null
  );
  announceOutboxChange();
  kick();
}

export async function retryAll(): Promise<void> {
  const entries = await getAllOutboxEntries();
  for (const e of entries) {
    if (e.status === "failed") {
      await updateOutboxEntry(e.id, (cur) =>
        cur.status === "failed" ? { ...cur, status: "pending", nextAttemptAt: Date.now() } : null
      );
    }
  }
  announceOutboxChange();
  kick();
}

// ─── Bootstrap ───────────────────────────────────────────────────────

let initialized = false;

/** Call once from a top-level client component (see POSNav). */
export function initSyncEngine(client: QueryClient) {
  setSyncQueryClient(client);
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  void resetInflightToPending();

  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });
  // navigator.onLine lies constantly (connected-but-no-internet captive
  // portals), so a slow poll backstops the online/visibility events.
  setInterval(kick, 20_000);
  kick();
}

/** A reload mid-sync leaves an entry `inflight` forever otherwise. */
async function resetInflightToPending() {
  const entries = await getAllOutboxEntries();
  for (const e of entries) {
    if (e.status === "inflight") {
      await updateOutboxEntry(e.id, (cur) =>
        cur.status === "inflight" ? { ...cur, status: "pending", nextAttemptAt: Date.now() } : null
      );
    }
  }
}
