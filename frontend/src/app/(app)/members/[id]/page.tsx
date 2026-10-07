import { Suspense } from "react";
import { MemberProfilePage } from "@/features/members/member-profile";

export default function Page() {
  return (
    <Suspense>
      <MemberProfilePage />
    </Suspense>
  );
}
