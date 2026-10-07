import type { Messages } from "../../types";
import { account } from "./account";
import { api } from "./api";
import { auth } from "./auth";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { labels } from "./labels";
import { members } from "./members";
import { memberships } from "./memberships";
import { payments } from "./payments";
import { plans } from "./plans";
import { reports } from "./reports";
import { settings } from "./settings";
import { shell } from "./shell";
import { staff } from "./staff";

/** Amharic catalog (አማርኛ). Type-checked against the English shape: a missing key fails the build. */
export const am: Messages = {
  common,
  shell,
  labels,
  auth,
  dashboard,
  members,
  payments,
  memberships,
  plans,
  reports,
  staff,
  settings,
  account,
  api,
};
