import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import {
  fetchCategories,
  fetchMenuItems,
  fetchAllMenuItems,
  fetchModifiersForItem,
  fetchAllModifiers,
  fetchParkedOrders,
  fetchTodayAnalytics,
  fetchCompletedOrders,
  fetchAnalyticsData,
  createOrder,
  completeOrder,
  cancelOrder,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createCategory,
  createModifier,
  updateModifier,
  deleteModifier,
  createModifierOption,
  deleteModifierOption,
  fetchStaffProfiles,
  updateStaffRole,
  removeStaffProfile,
  inviteStaffMember,
  updateOwnProfile,
  getCurrentProfile,
  fetchLocationSettings,
  updateLocationSettings,
} from "./queries";
import type { CartItem, PaymentMethod } from "./types";

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
  parkedOrders: ["parkedOrders"] as const,
  todayAnalytics: ["todayAnalytics"] as const,
  completedOrders: (start?: string, end?: string) =>
    ["completedOrders", start, end] as const,
  analytics: (start?: string, end?: string) =>
    ["analytics", start, end] as const,
  staffProfiles: ["staffProfiles"] as const,
  currentProfile: ["currentProfile"] as const,
  locationSettings: ["locationSettings"] as const,
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
    mutationFn: (cartItems: CartItem[]) => createOrder(cartItems),
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

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.parkedOrders });
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

export function useAnalytics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: queryKeys.analytics(startDate, endDate),
    queryFn: () => fetchAnalyticsData(startDate, endDate),
    staleTime: SHORT_CACHE,
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
