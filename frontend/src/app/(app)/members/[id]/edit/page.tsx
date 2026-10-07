import { Suspense } from "react";
import { MemberEditPage } from "@/features/members/member-edit-page";

export default function Page() {
  return (
    <Suspense>
      <MemberEditPage />
    </Suspense>
  );
}
