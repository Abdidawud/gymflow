import { Suspense } from "react";
import { PaymentsPage } from "@/features/payments/payments-page";

export default function Page() {
  return (
    <Suspense>
      <PaymentsPage />
    </Suspense>
  );
}
