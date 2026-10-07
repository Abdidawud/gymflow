"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PaymentDrawer } from "./payment-drawer";

interface PaymentDrawerContextValue {
  /** Open the shared drawer; preselects the member when opened from their profile. */
  openPaymentDrawer: (options?: { memberId?: string }) => void;
}

const PaymentDrawerContext = createContext<PaymentDrawerContextValue | null>(null);

/** One shared drawer for the whole app; it overlays and preserves the current screen. */
export function PaymentDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; memberId?: string; instance: number }>({
    open: false,
    instance: 0,
  });

  const openPaymentDrawer = useCallback((options?: { memberId?: string }) => {
    // A new instance per opening resets the form and the operation key.
    setState((current) => ({ open: true, memberId: options?.memberId, instance: current.instance + 1 }));
  }, []);

  const value = useMemo(() => ({ openPaymentDrawer }), [openPaymentDrawer]);

  return (
    <PaymentDrawerContext.Provider value={value}>
      {children}
      {state.instance > 0 ? (
        <PaymentDrawer
          key={state.instance}
          open={state.open}
          initialMemberId={state.memberId}
          onOpenChange={(open) => setState((current) => ({ ...current, open }))}
        />
      ) : null}
    </PaymentDrawerContext.Provider>
  );
}

export function usePaymentDrawer(): PaymentDrawerContextValue {
  const context = useContext(PaymentDrawerContext);
  if (!context) throw new Error("usePaymentDrawer must be used within PaymentDrawerProvider");
  return context;
}
