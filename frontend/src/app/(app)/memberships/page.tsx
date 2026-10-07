import { Suspense } from "react";
import { MembershipsPage } from "@/features/memberships/memberships-page";

export default function Page() {
  return (
    <Suspense>
      <MembershipsPage />
    </Suspense>
  );
}
