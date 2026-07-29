import { useReducer } from "react";
import type { DiscountType, PaymentMethod } from "@/lib/types";

export type CheckoutFormState = {
  paymentMethod: PaymentMethod | null;
  sinpeRef: string;
  tip: string;
  tendered: string;
  discountType: DiscountType;
  discountValue: string;
  discountReason: string;
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
  voidReason: "",
  needsInvoice: false,
  invoiceName: "",
  invoiceId: "",
  invoiceEmail: "",
};

type Action =
  | { type: "SET_FIELD"; field: keyof CheckoutFormState; value: CheckoutFormState[keyof CheckoutFormState] }
  | { type: "CLEAR_DISCOUNT" }
  // A discount belongs to the order it was keyed against; carrying it to
  // the next one would quietly comp a sale. Mirrors the queue's onClick
  // in the original page — payment/discount reset, but NOT void reason
  // or invoice fields (that asymmetry is pre-existing, not new).
  | { type: "SELECT_ORDER" }
  | { type: "RESET_ALL" };

function reducer(state: CheckoutFormState, action: Action): CheckoutFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "CLEAR_DISCOUNT":
      return { ...state, discountValue: "", discountReason: "" };
    case "SELECT_ORDER":
      return {
        ...state,
        paymentMethod: null,
        sinpeRef: "",
        tip: "",
        tendered: "",
        needsInvoice: false,
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
    selectOrder: () => dispatch({ type: "SELECT_ORDER" }),
    resetAll: () => dispatch({ type: "RESET_ALL" }),
  };
}
