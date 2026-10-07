import { Suspense } from "react";
import { MembersPage } from "@/features/members/members-page";

export default function Page() {
  return (
    <Suspense>
      <MembersPage />
    </Suspense>
  );
}
