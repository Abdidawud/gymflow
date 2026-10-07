import { RequirePermission } from "@/components/shell/require-permission";
import { StaffPage } from "@/features/staff/staff-page";

export default function Page() {
  return (
    <RequirePermission permission="staff.manage">
      <StaffPage />
    </RequirePermission>
  );
}
