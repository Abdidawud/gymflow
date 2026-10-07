import type { MembershipState } from "@/lib/api/types";
import { statusDetail, type StatusDetail } from "@/lib/domain/membership";
import type { Translator } from "./translator";

type Words = Pick<Translator, "t" | "f">;
type StateInput = Pick<
  MembershipState,
  "status" | "remainingDays" | "daysUntilStart" | "next" | "last" | "coverageEnd"
>;

/** The status qualifier for a membership state, as data. */
export function detailOf(state: StateInput): StatusDetail | null {
  return statusDetail({
    status: state.status,
    remainingDays: state.remainingDays,
    daysUntilStart: state.daysUntilStart,
    nextStartDate: state.next?.startDate ?? null,
    lastEndDate: state.last?.endDate ?? null,
  });
}

/** "23 days left" / "23d left" / "Expires today" / "Starts Oct 12" / "Ended Sep 30". */
export function detailText({ t, f }: Words, detail: StatusDetail, short = false): string {
  switch (detail.kind) {
    case "daysLeft":
      return short
        ? t("labels.detail.daysLeftShort", { count: detail.days })
        : t("labels.detail.daysLeft", { count: detail.days });
    case "expiresToday":
      return t("labels.detail.expiresToday");
    case "starts":
      return t("labels.detail.starts", { date: f.shortDate(detail.date) });
    case "ended":
      return t("labels.detail.ended", { date: f.shortDate(detail.date) });
  }
}

/** Plain-language validity sentence for profiles and the payment drawer. */
export function validitySentence({ t, f }: Words, state: StateInput): string {
  switch (state.status) {
    case "ACTIVE":
    case "EXPIRING_SOON":
      if (!state.coverageEnd) return t("labels.validity.validToday");
      return state.remainingDays === 0
        ? t("labels.validity.expiresToday", { date: f.date(state.coverageEnd) })
        : t("labels.validity.validThrough", { date: f.date(state.coverageEnd) });
    case "SCHEDULED":
      return state.next
        ? t("labels.validity.starts", { date: f.date(state.next.startDate) })
        : t("labels.validity.scheduled");
    case "EXPIRED":
      return state.last
        ? t("labels.validity.expiredOn", { date: f.date(state.last.endDate) })
        : t("labels.validity.expired");
    case "UNPAID":
      return t("labels.validity.unpaid");
  }
}
