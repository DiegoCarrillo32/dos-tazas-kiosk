"use client";

import { useParkedOrders } from "@/lib/hooks";
import type { Order, OrderItem, OrderItemModifier } from "@/lib/types";
import { useOutbox } from "./useOutbox";
import type { OutboxEntry, OutboxStatus } from "./types";

export type QueueOrder = Order & {
  /** Present only for a local (not-yet-synced) projection, never a real server row. */
  __local?: { entryId: string; offlineRef: string; status: OutboxStatus; attempts: number };
  /** A queued pay_order targets this real server order — block re-paying it. */
  __payPending?: boolean;
};

function projectEntryToOrder(e: OutboxEntry): QueueOrder {
  const order_items: OrderItem[] = e.snapshot.lines.map((line, i) => ({
    id: `local-item-${e.id}-${i}`,
    order_id: `local:${e.id}`,
    menu_item_id: "",
    quantity: line.quantity,
    unit_price: 0,
    total_price: 0,
    tax_amount: 0,
    notes: null,
    created_at: e.occurredAtIso,
    menu_item: { name: line.name } as OrderItem["menu_item"],
    modifiers: line.modifiers.map((name, j) => ({
      id: `local-mod-${e.id}-${i}-${j}`,
      order_item_id: `local-item-${e.id}-${i}`,
      modifier_option_id: "",
      name,
      extra_price: 0,
      created_at: e.occurredAtIso,
    })) as OrderItemModifier[],
  }));

  return {
    id: `local:${e.id}`,
    location_id: "",
    user_id: null,
    status: "parked",
    table_id: e.tableId ?? null,
    shift_id: null,
    order_number: null,
    subtotal: e.snapshot.totalAmount,
    tax_amount: 0,
    tax_rate: 0,
    discount_amount: 0,
    discount_reason: null,
    tip_amount: 0,
    total_amount: e.snapshot.totalAmount,
    amount_tendered: null,
    change_due: null,
    payment_method: null,
    payment_reference: null,
    customer_name: null,
    customer_id: null,
    customer_email: null,
    created_at: e.occurredAtIso,
    updated_at: e.occurredAtIso,
    order_items,
    table: e.snapshot.tableName ? { name: e.snapshot.tableName } : null,
    __local: { entryId: e.id, offlineRef: e.offlineRef, status: e.status, attempts: e.attempts },
  };
}

/**
 * Merges the server's parked-orders list with local (not-yet-synced)
 * `create_order` entries so the Counter queue shows everything payable —
 * whether or not it has reached the server yet. Deliberately does NOT
 * wrap `fetchParkedOrders`: the network query stays pure, and this hook
 * layers the local projection on top.
 */
export function useMergedParkedOrders() {
  const { data: serverOrders = [], isLoading, isRefetching, refetch } = useParkedOrders();
  const { entries, pendingCount, failedCount } = useOutbox();

  const payPendingOrderIds = new Set(
    entries
      .filter((e) => e.kind === "pay_order" && (e.status === "pending" || e.status === "inflight"))
      .map((e) => e.serverOrderId)
  );

  // A projection disappears the instant its entry is `done` — the real
  // server row is already at that point (the RPC awaits the commit before
  // returning), so there's no window where neither is visible.
  const localOrders: QueueOrder[] = entries
    .filter((e) => e.kind === "create_order" && e.status !== "done")
    .map(projectEntryToOrder);

  const orders: QueueOrder[] = [
    ...serverOrders.map((o) =>
      payPendingOrderIds.has(o.id) ? { ...o, __payPending: true } : o
    ),
    ...localOrders,
  ];

  return { orders, isLoading, isRefetching, refetch, pendingCount, failedCount };
}
