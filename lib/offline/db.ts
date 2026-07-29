import type { OutboxEntry } from "./types";

/**
 * Hand-rolled IndexedDB wrapper — no dependency. This code path holds
 * unremitted money between "the customer paid" and "the server knows it";
 * a 20-line promisify covers the whole surface we need (indexed cursors,
 * atomic status transitions), which a KV-shaped library like idb-keyval
 * doesn't give us. localStorage was ruled out because QueryProvider
 * already persists the whole menu/modifier cache there — adding
 * orders-with-items risks a QuotaExceededError that would silently drop
 * a PAID order, and localStorage's synchronous API would jank the main
 * thread on every outbox write mid-sale.
 */

const DB_NAME = "dostazas-offline";
const DB_VERSION = 1;
const OUTBOX_STORE = "outbox";
const META_STORE = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("by_status", "status");
        store.createIndex("by_seq", "seq", { unique: true });
        store.createIndex("by_status_seq", ["status", "seq"]);
        store.createIndex("by_server_order", "serverOrderId");
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  });

  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode) {
  return db.transaction(store, mode).objectStore(store);
}

// ─── Outbox ────────────────────────────────────────────────────────

export async function putOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, OUTBOX_STORE, "readwrite").put(entry));
}

export async function getOutboxEntry(id: string): Promise<OutboxEntry | undefined> {
  const db = await openDb();
  return promisify(tx(db, OUTBOX_STORE, "readonly").get(id));
}

export async function getAllOutboxEntries(): Promise<OutboxEntry[]> {
  const db = await openDb();
  const all = await promisify(tx(db, OUTBOX_STORE, "readonly").getAll());
  return (all as OutboxEntry[]).sort((a, b) => a.seq - b.seq);
}

/** Ordered oldest-first — the drain cursor. */
export async function getPendingOutboxEntries(): Promise<OutboxEntry[]> {
  const all = await getAllOutboxEntries();
  return all.filter((e) => e.status === "pending");
}

export async function deleteOutboxEntry(id: string): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, OUTBOX_STORE, "readwrite").delete(id));
}

/**
 * Read-modify-write guarded by re-checking `status` inside the same
 * transaction, so a tap that races the sync engine (which may have just
 * picked the entry up and flipped it to `inflight`) aborts instead of
 * silently clobbering an in-flight attempt.
 */
export async function updateOutboxEntry(
  id: string,
  mutate: (entry: OutboxEntry) => OutboxEntry | null
): Promise<OutboxEntry | null> {
  const db = await openDb();
  const store = db.transaction(OUTBOX_STORE, "readwrite").objectStore(OUTBOX_STORE);
  const existing = (await promisify(store.get(id))) as OutboxEntry | undefined;
  if (!existing) return null;
  const next = mutate(existing);
  if (!next) return null;
  await promisify(store.put(next));
  return next;
}

// ─── Meta (device id, cached location/profile ids) ─────────────────

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const row = (await promisify(tx(db, META_STORE, "readonly").get(key))) as
    | { key: string; value: T }
    | undefined;
  return row?.value;
}

export async function writeMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await promisify(tx(db, META_STORE, "readwrite").put({ key, value }));
}

/** Monotonic per-device counter — the drain order tiebreaker. */
export async function nextSeq(): Promise<number> {
  const db = await openDb();
  const store = db.transaction(META_STORE, "readwrite").objectStore(META_STORE);
  const row = (await promisify(store.get("seq"))) as { key: string; value: number } | undefined;
  const next = (row?.value ?? 0) + 1;
  await promisify(store.put({ key: "seq", value: next }));
  return next;
}

/** Stable per-install id, used as `device_id` on synced orders/shifts. */
export async function getDeviceId(): Promise<string> {
  const existing = await readMeta<string>("deviceId");
  if (existing) return existing;
  const id = crypto.randomUUID();
  await writeMeta("deviceId", id);
  return id;
}
