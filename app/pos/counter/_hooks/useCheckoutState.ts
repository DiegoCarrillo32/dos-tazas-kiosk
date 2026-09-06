import { useReducer } from "react";
import type { DiscountType, PaymentMethod } from "@/lib/types";

/**
 * `order` — the discount comes off the whole tab (the original behaviour).
 * `items` — it comes off only the lines in `discountItems`, which maps an
 * order_item id to how many of its units are covered. A loyalty club free
 * coffee is one line, quantity 1.
 */
export type DiscountScope = "order" | "items";

export type CheckoutFormState = {
  paymentMethod: PaymentMethod | null;
  sinpeRef: string;
  tip: string;
  tendered: string;
  discountType: DiscountType;
  discountValue: string;
  discountReason: string;
  discountScope: DiscountScope;
  discountItems: Record<string, number>;
  voidReason: string;
  needsInvoice: boolean;
  invoiceName: string;
  invoiceId: string;
  invoiceEmail: string;
};

const initialState: CheckoutFormState = {
  paymentMethod: null,
  sinpeRef: "",
  tip: "",
  tendered: "",
  discountType: "percent",
  discountValue: "",
  discountReason: "",
  discountScope: "order",
  discountItems: {},
  voidReason: "",
  needsInvoice: false,
  invoiceName: "",
  invoiceId: "",
  invoiceEmail: "",
};

type Action =
  | { type: "SET_FIELD"; field: keyof CheckoutFormState; value: CheckoutFormState[keyof CheckoutFormState] }
  | { type: "CLEAR_DISCOUNT" }
  | { type: "TOGGLE_DISCOUNT_ITEM"; orderItemId: string; quantity: number }
  | { type: "SET_DISCOUNT_ITEM_QTY"; orderItemId: string; quantity: number }
  // A discount belongs to the order it was keyed against; carrying it to
  // the next one would quietly comp a sale. The same is true of the
  // customer's invoice details and the void reason: leaving those behind
  // put the PREVIOUS customer's name, cédula and email in front of the
  // next one, one "needs invoice" tick away from being filed against the
  // wrong person. Every per-order field resets here.
  | { type: "SELECT_ORDER" }
  | { type: "RESET_ALL" };

function reducer(state: CheckoutFormState, action: Action): CheckoutFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "CLEAR_DISCOUNT":
      return { ...state, discountValue: "", discountReason: "", discountScope: "order", discountItems: {} };
    // A selection is keyed against one specific line of one specific
    // order; toggling it needs its own action so the two spots that
    // touch it cannot drift.
    case "TOGGLE_DISCOUNT_ITEM": {
      const next = { ...state.discountItems };
      if (next[action.orderItemId] != null) delete next[action.orderItemId];
      else next[action.orderItemId] = action.quantity;
      return { ...state, discountItems: next };
    }
    case "SET_DISCOUNT_ITEM_QTY": {
      if (state.discountItems[action.orderItemId] == null) return state;
      return {
        ...state,
        discountItems: { ...state.discountItems, [action.orderItemId]: action.quantity },
      };
    }
    case "SELECT_ORDER":
      return {
        ...state,
        paymentMethod: null,
        sinpeRef: "",
        tip: "",
        tendered: "",
        needsInvoice: false,
        invoiceName: "",
        invoiceId: "",
        invoiceEmail: "",
        voidReason: "",
        discountValue: "",
        discountReason: "",
      };
    case "RESET_ALL":
      return initialState;
    default:
      return state;
  }
}

/**
 * All the Counter's checkout-form fields in one reducer, replacing ~12
 * separate `useState` calls. The two reset shapes (a fresh order picked
 * from the queue vs. a completed/voided checkout) are actions rather than
 * ad-hoc setter sequences, so the two spots that used to hand-roll them
 * can't drift apart from each other again.
 */
export function useCheckoutState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setField = <K extends keyof CheckoutFormState>(field: K, value: CheckoutFormState[K]) =>
    dispatch({ type: "SET_FIELD", field, value });

  return {
    ...state,
    setField,
    clearDiscount: () => dispatch({ type: "CLEAR_DISCOUNT" }),
    toggleDiscountItem: (orderItemId: string, quantity: number) =>
      dispatch({ type: "TOGGLE_DISCOUNT_ITEM", orderItemId, quantity }),
    setDiscountItemQty: (orderItemId: string, quantity: number) =>
      dispatch({ type: "SET_DISCOUNT_ITEM_QTY", orderItemId, quantity }),
    selectOrder: () => dispatch({ type: "SELECT_ORDER" }),
    resetAll: () => dispatch({ type: "RESET_ALL" }),
  };
}
