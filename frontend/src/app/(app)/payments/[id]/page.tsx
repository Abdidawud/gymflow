import { Suspense } from "react";
import { PaymentDetailsPage } from "@/features/payments/payment-details-page";

export default function Page() {
  return (
    <Suspense>
      <PaymentDetailsPage />
    </Suspense>
  );
}
