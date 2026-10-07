import { Suspense } from "react";
import { RequirePermission } from "@/components/shell/require-permission";
import { ReportsPage } from "@/features/reports/reports-page";

export default function Page() {
  return (
    <RequirePermission permission="reports.view">
      <Suspense>
        <ReportsPage />
      </Suspense>
    </RequirePermission>
  );
}
