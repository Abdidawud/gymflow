import { RequirePermission } from "@/components/shell/require-permission";
import { PlansPage } from "@/features/plans/plans-page";

export default function Page() {
  return (
    <RequirePermission permission="plans.manage">
      <PlansPage />
    </RequirePermission>
  );
}
