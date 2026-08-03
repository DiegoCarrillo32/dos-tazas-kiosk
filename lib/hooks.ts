import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { kick as kickOfflineSync } from "./offline/sync";
import { useOutbox } from "./offline/useOutbox";
import { writeMeta } from "./offline/db";
import { clearOfflineShell } from "@/components/ServiceWorkerRegistrar";
import { useT } from "./i18n/LanguageContext";
import { useToast, useConfirm } from "@/components/ui/Feedback";
import { PERSISTED_QUERY_CACHE_KEY } from "./QueryProvider";
import {
  fetchCategories,
  fetchMenuItems,
  fetchAllMenuItems,
  fetchAllModifiers,
  fetchMenuItemModifierMap,
  fetchParkedOrders,
  fetchTodayAnalytics,
  fetchCompletedOrders,
  fetchOfflineSyncFlags,
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
  updateModifierOption,
  deleteModifierOption,
  fetchMenuItemModifierLinks,
  setMenuItemModifiers,
  fetchStaffProfiles,
  updateStaffRole,
  removeStaffMember,
  addStaffMemberByEmail,
  inviteStaffMember,
  updateOwnProfile,
  getCurrentProfile,
  resetProfileCache,
  fetchLocationSettings,
  updateLocationSettings,
  fetchSessionContext,
  switchLocation,
  createLocation,
  updateLocation,
  archiveLocation,
  restoreLocation,
} from "./queries";
import type { CartItem, CashMovementType, CountedBreakdown, DiscountType, PaymentMethod } from "./types";

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
  menuItemModifierMap: ["menuItemModifierMap"] as const,
  menuItemModifierLinks: (id: string) => ["menuItemModifierLinks", id] as const,
  parkedOrders: ["parkedOrders"] as const,
  todayAnalytics: ["todayAnalytics"] as const,
  completedOrders: (start?: string, end?: string) =>
    ["completedOrders", start, end] as const,
  analytics: (start?: string, end?: string) =>
    ["analytics", start, end] as const,
  staffProfiles: ["staffProfiles"] as const,
  currentProfile: ["currentProfile"] as const,
  sessionContext: ["sessionContext"] as const,
  locationSettings: ["locationSettings"] as const,
  tables: ["tables"] as const,
  currentShift: ["currentShift"] as const,
  shiftSummary: (id: string) => ["shiftSummary", id] as const,
  recentShifts: ["recentShifts"] as const,
  businessDate: ["businessDate"] as const,
  offlineSyncFlags: ["offlineSyncFlags"] as const,
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
    // A live websocket to Supabase is the best evidence available that the
    // API is actually reachable — better than navigator.onLine, which
    // lies constantly (captive portals, "connected, no internet"). Kick
    // the offline outbox drain the moment this flips from disconnected to
    // connected rather than waiting for the next polling interval.
    let wasConnected = false;
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
      .subscribe((status) => {
        const isConnected = status === "SUBSCRIBED";
        setConnected(isConnected);
        if (isConnected && !wasConnected) {
          kickOfflineSync();
        }
        wasConnected = isConnected;
      });

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
      discountType?: DiscountType | null;
      discountValue?: number;
      discountReason?: string | null;
    }) => completeOrder(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
      qc.invalidateQueries({ queryKey: queryKeys.todayAnalytics });
      qc.invalidateQueries({ queryKey: ["completedOrders"] });
      // A cash sale changes the drawer's expected cash. Realtime usually
      // covers this, but the whole point of this mutation path is
      // working through exactly the flaky connection where realtime
      // isn't reliable either — don't depend on it alone.
      invalidateShift(qc);
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

/** Orders an offline sync flagged for review — see fetchOfflineSyncFlags. */
export function useOfflineSyncFlags() {
  return useQuery({
    queryKey: queryKeys.offlineSyncFlags,
    queryFn: () => fetchOfflineSyncFlags(),
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
    // clientUuid lets a double-tap or a dropped-response retry replay
    // cleanly (open_shift treats it as an idempotency key — see
    // migration 00019) instead of raising "a shift is already open".
    mutationFn: (params: { openingFloat: number; clientUuid?: string | null }) =>
      openShift(params.openingFloat, params.clientUuid ?? null),
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

export function useUpdateModifierOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateModifierOption>[1] }) =>
      updateModifierOption(id, updates),
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
    queryKey: queryKeys.menuItemModifierLinks(menuItemId ?? ""),
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
      qc.invalidateQueries({ queryKey: queryKeys.menuItemModifierLinks(menuItemId) });
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

/** Revokes access to the ACTIVE location only — see removeStaffMember. */
export function useRemoveStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeStaffMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.staffProfiles });
    },
  });
}

/** Grants an existing account access to the active location. */
export function useAddStaffMemberByEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: "admin" | "staff" }) =>
      addStaffMemberByEmail(email, role),
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

// ─── Locations & Session ───────────────────────────────────────────

export function useSessionContext() {
  return useQuery({
    queryKey: queryKeys.sessionContext,
    queryFn: fetchSessionContext,
    staleTime: LONG_CACHE,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; address?: string | null; copyMenuFrom?: string | null }) =>
      createLocation(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sessionContext });
    },
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, address }: { id: string; name: string; address?: string | null }) =>
      updateLocation(id, name, address),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sessionContext });
    },
  });
}

export function useArchiveLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: archiveLocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sessionContext });
    },
  });
}

export function useRestoreLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreLocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sessionContext });
    },
  });
}

/**
 * Switching locations is not a normal mutation — it changes what
 * `get_current_location_id()` resolves server-side, which every RLS
 * policy and every query key in this file implicitly depends on. Modeled
 * directly on `useLogout` below, which already does most of this
 * teardown for the same reason (a shared kiosk must not serve the next
 * session cached data scoped to the wrong identity):
 *
 *  1. Block while the offline outbox has pending/failed entries — a
 *     queued sale is stamped for the CURRENT location (Phase 4) and a
 *     switch mid-drain risks it landing in the wrong one.
 *  2. Warn (don't block) if the current location has an open shift —
 *     shifts are per-location (one open per location at a time), so the
 *     till stays open and unaffected; just make sure that's understood.
 *  3. Call the RPC, which is the only thing actually guarded server-side
 *     (membership + not-archived) — everything else here is UX.
 *  4. Reset the profile cache, clear the in-memory AND persisted query
 *     cache (every key above is location-implicit), and clear the
 *     offline shell — otherwise `/admin/menu` would rehydrate the old
 *     location's data under the new one for a moment.
 *  5. Stamp the new active location into the offline meta store so a
 *     device that goes offline immediately after switching still tags
 *     new outbox entries correctly (Phase 4).
 *  6. Tell other tabs to reload via BroadcastChannel — a second tab
 *     sitting on /pos/counter with a cart built from the old location's
 *     menu would otherwise silently keep operating on stale data.
 *  7. `window.location.assign`, never `router.push` — a client-side
 *     navigation doesn't reset module state (profileMemo in
 *     lib/queries.ts survives it), and a full document reload is what
 *     re-runs the server layouts' role gate for the new location.
 */
export function useSwitchLocation() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { pendingCount, failedCount } = useOutbox();

  return async (locationId: string) => {
    const stillPending = pendingCount + failedCount;
    if (stillPending > 0) {
      toast(t("locations.cannotSwitchPending", { n: stillPending }));
      return;
    }

    const shift = await fetchShiftSummary(null).catch(() => null);
    if (shift?.status === "open") {
      if (!(await confirmDialog(t("locations.switchConfirmOpenShift")))) return;
    }

    try {
      await switchLocation(locationId);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
      return;
    }

    resetProfileCache();
    qc.clear();
    try {
      window.localStorage.removeItem(PERSISTED_QUERY_CACHE_KEY);
    } catch {
      // Storage unavailable — nothing to clear.
    }
    clearOfflineShell();
    try {
      await writeMeta("activeLocationId", locationId);
    } catch {
      // IndexedDB unavailable — offline stamping degrades to "unstamped",
      // handled as a wildcard rather than a hard failure (Phase 4).
    }
    try {
      new BroadcastChannel("dostazas-session").postMessage({ type: "location-switch" });
    } catch {
      // BroadcastChannel unsupported — other tabs simply won't auto-reload.
    }

    window.location.assign(window.location.pathname);
  };
}

/**
 * Reloads this tab when another tab in the same browser switches
 * location — see step 6 of useSwitchLocation. Mount once per app shell
 * (AdminShell); harmless to mount from more than one place.
 */
export function useLocationSwitchListener() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("dostazas-session");
    channel.onmessage = (event) => {
      if (event.data?.type === "location-switch") {
        window.location.reload();
      }
    };
    return () => channel.close();
  }, []);
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

// ─── Logout ──────────────────────────────────────────────────────────

/**
 * One shared logout for both POSNav and AdminShell — previously each
 * reimplemented it, and only POSNav had the pending-outbox guard, so
 * closing the admin tab was a way to sign out around a queued sale that
 * still needs THIS session's JWT to sync. Also clears every trace of
 * identity a shared kiosk's next cashier could otherwise inherit:
 * `getCurrentProfile`'s in-memory + localStorage cache (see
 * `resetProfileCache`), and the persisted TanStack Query cache — plain
 * `qc.clear()` alone empties the in-memory cache but leaves the previous
 * user's data sitting in localStorage for the next login to rehydrate
 * before their own fetch returns.
 */
export function useLogout() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { pendingCount, failedCount } = useOutbox();
  const toast = useToast();

  return async () => {
    const stillPending = pendingCount + failedCount;
    if (stillPending > 0) {
      toast(t("offline.cannotLogoutPending", { n: stillPending }));
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();

    resetProfileCache();
    qc.clear();
    try {
      window.localStorage.removeItem(PERSISTED_QUERY_CACHE_KEY);
    } catch {
      // Storage unavailable — nothing to clear.
    }
    // /pos/floor and /pos/counter render THIS user's data server-side, so
    // a shared kiosk's next cashier must not cold-start into the
    // previous one's cached shell (see ServiceWorkerRegistrar.tsx).
    clearOfflineShell();

    router.push("/login");
  };
}
