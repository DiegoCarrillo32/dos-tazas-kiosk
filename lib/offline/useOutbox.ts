"use client";

import { useCallback, useEffect, useState } from "react";
import { discardLocalEntry, listOutboxEntries, subscribeOutbox } from "./outbox";
import { kick, retryAll, retryEntry } from "./sync";
import type { OutboxEntry } from "./types";

export function useOutbox() {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  const refresh = useCallback(() => {
    void listOutboxEntries().then(setEntries);
  }, []);

  useEffect(() => {
    refresh();
    return subscribeOutbox(refresh);
  }, [refresh]);

  const pendingCount = entries.filter((e) => e.status === "pending" || e.status === "inflight").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;

  return {
    entries,
    pendingCount,
    failedCount,
    retryEntry,
    retryAll,
    discardLocalEntry,
    kick,
  };
}
