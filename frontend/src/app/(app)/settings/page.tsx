import { RequirePermission } from "@/components/shell/require-permission";
import { SettingsPage } from "@/features/settings/settings-page";

export default function Page() {
  return (
    <RequirePermission permission="settings.manage">
      <SettingsPage />
    </RequirePermission>
  );
}
