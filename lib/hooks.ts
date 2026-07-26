import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import {
  fetchCategories,
  fetchMenuItems,
  fetchAllMenuItems,
  fetchModifiersForItem,
  fetchAllModifiers,
  fetchMenuItemModifierMap,
  fetchParkedOrders,
  fetchTodayAnalytics,
  fetchCompletedOrders,
  fetchSalesSummary,
  currentBusinessDate,
  fetchShiftSummary,
  fetchRecentShifts,
  openShift,
  closeShift,
  recordCashMovement,
  createOrder,
  appendToOrder,
  completeOrder,
  voidOrder,
  refundOrder,
  fetchTables,
  createTable,
  updateTable,
  deleteTable,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createCategory,
  updateCategory,
  deleteCategory,
  createModifier,
  updateModifier,
  deleteModifier,
  createModifierOption,
  deleteModifierOption,
  fetchMenuItemModifierLinks,
  setMenuItemModifiers,
  fetchStaffProfiles,
  updateStaffRole,
  removeStaffProfile,
  inviteStaffMember,
  updateOwnProfile,
  getCurrentProfile,
  fetchLocationSettings,
  updateLocationSettings,
} from "./queries";
import type { CartItem, CashMovementType, CountedBreakdown, PaymentMethod } from "./types";

// ─── Cache durations ───────────────────────────────────────────────

const LONG_CACHE = 1000 * 60 * 10;  // 10 minutes – categories, modifiers
const MED_CACHE  = 1000 * 60 * 5;   // 5 minutes  – menu items
const SHORT_CACHE = 1000 * 30;       // 30 seconds – orders, analytics

// ─── Query Keys ────────────────────────────────────────────────────

export const queryKeys = {
  categories: ["categories"] as const,
  menuItems: ["menuItems"] as const,
  allMenuItems: ["allMenuItems"] as const,
  modifiers: ["modifiers"] as const,
  modifiersForItem: (id: string) => ["modifiersForItem", id] as const,
  menuItemModifierMap: ["menuItemModifierMap"] as const,
  parkedOrders: ["parkedOrders"] as const,
  todayAnalytics: ["todayAnalytics"] as const,
  completedOrders: (start?: string, end?: string) =>
    ["completedOrders", start, end] as const,
  analytics: (start?: string, end?: string) =>
    ["analytics", start, end] as const,
  staffProfiles: ["staffProfiles"] as const,
  currentProfile: ["currentProfile"] as const,
  locationSettings: ["locationSettings"] as const,
  tables: ["tables"] as const,
  currentShift: ["currentShift"] as const,
  shiftSummary: (id: string) => ["shiftSummary", id] as const,
  recentShifts: ["recentShifts"] as const,
  businessDate: ["businessDate"] as const,
};

// ─── Categories ────────────────────────────────────────────────────

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategories,
    staleTime: LONG_CACHE,
  });
}

// ─── Menu Items ────────────────────────────────────────────────────

export function useMenuItems() {
  return useQuery({
    queryKey: queryKeys.menuItems,
    queryFn: fetchMenuItems,
    staleTime: MED_CACHE,
  });
}

export function useAllMenuItems() {
  return useQuery({
    queryKey: queryKeys.allMenuItems,
    queryFn: fetchAllMenuItems,
    staleTime: MED_CACHE,
  });
}

// ─── Modifiers ─────────────────────────────────────────────────────

export function useModifiersForItem(menuItemId: string | null) {
  return useQuery({
    queryKey: queryKeys.modifiersForItem(menuItemId ?? ""),
    queryFn: () => fetchModifiersForItem(menuItemId!),
    enabled: !!menuItemId,
    staleTime: LONG_CACHE,
  });
}

export function useAllModifiers() {
  return useQuery({
    queryKey: queryKeys.modifiers,
    queryFn: fetchAllModifiers,
    staleTime: LONG_CACHE,
  });
}

/** menuItemId → modifierId[] for the whole location, cached for fast taps. */
export function useMenuItemModifierMap() {
  return useQuery({
    queryKey: queryKeys.menuItemModifierMap,
    queryFn: fetchMenuItemModifierMap,
    staleTime: LONG_CACHE,
  });
}

// ─── Orders ────────────────────────────────────────────────────────

export function useParkedOrders() {
  return useQuery({
    queryKey: queryKeys.parkedOrders,
    queryFn: fetchParkedOrders,
    staleTime: SHORT_CACHE,
  });
}

/**
 * Subscribe to live order changes so the parked-orders queue refreshes the
 * moment the Floor sends, the Counter completes, or an order is voided —
 * no manual refresh needed. Returns whether the realtime channel is connected.
 */
export function useOrdersRealtime(): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
          qc.invalidateQueries({ queryKey: queryKeys.todayAnalytics });
          // A completed/refunded order changes the drawer's expected cash.
          qc.invalidateQueries({ queryKey: queryKeys.currentShift });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_movements" },
        () => qc.invalidateQueries({ queryKey: queryKeys.currentShift })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts" },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.currentShift });
          qc.invalidateQueries({ queryKey: queryKeys.recentShifts });
        }
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return connected;
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { cartItems: CartItem[]; tableId?: string | null }) =>
      createOrder(params.cartItems, params.tableId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
    },
  });
}

export function useAppendToOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { orderId: string; cartItems: CartItem[] }) =>
      appendToOrder(params.orderId, params.cartItems),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
    },
  });
}

export function useCompleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      orderId: string;
      paymentMethod: PaymentMethod;
      paymentReference: string | null;
      tipAmount?: number;
      amountTendered?: number | null;
      customerName: string | null;
      customerId: string | null;
      customerEmail: string | null;
    }) => completeOrder(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
      qc.invalidateQueries({ queryKey: queryKeys.todayAnalytics });
      qc.invalidateQueries({ queryKey: ["completedOrders"] });
    },
  });
}

/** Void an unpaid (parked/draft) order. Available to all staff. */
export function useVoidOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { orderId: string; reason?: string | null }) =>
      voidOrder(params.orderId, params.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
      qc.invalidateQueries({ queryKey: queryKeys.currentShift });
    },
  });
}

/** Reverse a completed order. Admin only — enforced server-side. */
export function useRefundOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { orderId: string; reason?: string | null }) =>
      refundOrder(params.orderId, params.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["completedOrders"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: queryKeys.todayAnalytics });
      qc.invalidateQueries({ queryKey: queryKeys.currentShift });
    },
  });
}

// ─── Analytics ─────────────────────────────────────────────────────

export function useTodayAnalytics() {
  return useQuery({
    queryKey: queryKeys.todayAnalytics,
    queryFn: fetchTodayAnalytics,
    staleTime: SHORT_CACHE,
  });
}

export function useCompletedOrders(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: queryKeys.completedOrders(startDate, endDate),
    queryFn: () => fetchCompletedOrders(startDate, endDate),
    staleTime: SHORT_CACHE,
  });
}

export function useSalesSummary(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: queryKeys.analytics(startDate, endDate),
    queryFn: () => fetchSalesSummary(startDate!, endDate!),
    enabled: !!startDate && !!endDate,
    staleTime: SHORT_CACHE,
  });
}

/** Today's date (YYYY-MM-DD) in the shop's timezone, not the browser's. */
export function useBusinessDate() {
  return useQuery({
    queryKey: queryKeys.businessDate,
    queryFn: currentBusinessDate,
    staleTime: MED_CACHE,
  });
}

// ─── Shifts & cash drawer ──────────────────────────────────────────

/** The currently open shift's live summary (X-report), or null if none is open. */
export function useCurrentShift() {
  return useQuery({
    queryKey: queryKeys.currentShift,
    queryFn: () => fetchShiftSummary(null),
    staleTime: SHORT_CACHE,
  });
}

export function useShiftSummary(shiftId: string | null) {
  return useQuery({
    queryKey: queryKeys.shiftSummary(shiftId ?? ""),
    queryFn: () => fetchShiftSummary(shiftId),
    enabled: !!shiftId,
    staleTime: SHORT_CACHE,
  });
}

export function useRecentShifts(limit = 30) {
  return useQuery({
    queryKey: queryKeys.recentShifts,
    queryFn: () => fetchRecentShifts(limit),
    staleTime: SHORT_CACHE,
  });
}

/** Invalidate everything that depends on the drawer's running total. */
function invalidateShift(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.currentShift });
  qc.invalidateQueries({ queryKey: queryKeys.recentShifts });
}

export function useOpenShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (openingFloat: number) => openShift(openingFloat),
    onSuccess: () => invalidateShift(qc),
  });
}

export function useCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      countedCash: number;
      countedBreakdown?: CountedBreakdown | null;
      note?: string | null;
    }) => closeShift(params),
    onSuccess: () => invalidateShift(qc),
  });
}

export function useRecordCashMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      type: CashMovementType;
      amount: number;
      reason: string;
    }) => recordCashMovement(params),
    onSuccess: () => invalidateShift(qc),
  });
}

// ─── Admin Mutations (invalidate caches on success) ────────────────

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMenuItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
      qc.invalidateQueries({ queryKey: queryKeys.allMenuItems });
    },
  });
}

export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateMenuItem>[1] }) =>
      updateMenuItem(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
      qc.invalidateQueries({ queryKey: queryKeys.allMenuItems });
    },
  });
}

export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteMenuItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
      qc.invalidateQueries({ queryKey: queryKeys.allMenuItems });
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateCategory>[1] }) =>
      updateCategory(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
      qc.invalidateQueries({ queryKey: queryKeys.allMenuItems });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories });
      qc.invalidateQueries({ queryKey: queryKeys.menuItems });
      qc.invalidateQueries({ queryKey: queryKeys.allMenuItems });
    },
  });
}

export function useCreateModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createModifier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.modifiers });
    },
  });
}

export function useUpdateModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateModifier>[1] }) =>
      updateModifier(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.modifiers });
    },
  });
}

export function useDeleteModifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteModifier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.modifiers });
    },
  });
}

export function useCreateModifierOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createModifierOption,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.modifiers });
    },
  });
}

export function useDeleteModifierOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteModifierOption,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.modifiers });
    },
  });
}

export function useMenuItemModifierLinks(menuItemId: string | null) {
  return useQuery({
    queryKey: ["menuItemModifierLinks", menuItemId ?? ""],
    queryFn: () => fetchMenuItemModifierLinks(menuItemId!),
    enabled: !!menuItemId,
    staleTime: LONG_CACHE,
  });
}

export function useSetMenuItemModifiers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, modifierIds }: { menuItemId: string; modifierIds: string[] }) =>
      setMenuItemModifiers(menuItemId, modifierIds),
    onSuccess: (_data, { menuItemId }) => {
      qc.invalidateQueries({ queryKey: ["menuItemModifierLinks", menuItemId] });
      qc.invalidateQueries({ queryKey: queryKeys.modifiersForItem(menuItemId) });
      qc.invalidateQueries({ queryKey: queryKeys.menuItemModifierMap });
    },
  });
}

// ─── Staff Management ──────────────────────────────────────────────

export function useCurrentProfile() {
  return useQuery({
    queryKey: queryKeys.currentProfile,
    queryFn: getCurrentProfile,
    staleTime: LONG_CACHE,
  });
}

export function useStaffProfiles() {
  return useQuery({
    queryKey: queryKeys.staffProfiles,
    queryFn: fetchStaffProfiles,
    staleTime: MED_CACHE,
  });
}

export function useUpdateStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "staff" }) =>
      updateStaffRole(userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.staffProfiles });
    },
  });
}

export function useRemoveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeStaffProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.staffProfiles });
    },
  });
}

export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: "admin" | "staff";
    }) =>
      inviteStaffMember(
        params.email,
        params.password,
        params.firstName,
        params.lastName,
        params.role
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.staffProfiles });
    },
  });
}

// ─── Location Settings ─────────────────────────────────────────────

export function useLocationSettings() {
  return useQuery({
    queryKey: queryKeys.locationSettings,
    queryFn: fetchLocationSettings,
    staleTime: LONG_CACHE,
  });
}

export function useUpdateLocationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateLocationSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.locationSettings });
    },
  });
}

// ─── Tables ────────────────────────────────────────────────────────

export function useTables() {
  return useQuery({
    queryKey: queryKeys.tables,
    queryFn: fetchTables,
    staleTime: LONG_CACHE,
  });
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTable(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
}

export function useUpdateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { name?: string; sort_order?: number } }) =>
      updateTable(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTable,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables }),
  });
}

export function useUpdateOwnProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateOwnProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currentProfile });
      qc.invalidateQueries({ queryKey: queryKeys.staffProfiles });
    },
  });
}
