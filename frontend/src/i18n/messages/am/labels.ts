import type { Messages } from "../../types";

export const labels: Messages["labels"] = {
  status: {
    ACTIVE: "ንቁ",
    EXPIRING_SOON: "በቅርቡ የሚያበቃ",
    EXPIRED: "ጊዜው ያለፈበት",
    SCHEDULED: "የታቀደ",
    UNPAID: "ያልከፈለ",
  },
  detail: {
    daysLeft: { one: "{count} ቀን ቀርቷል", other: "{count} ቀናት ቀርተዋል" },
    daysLeftShort: "{count} ቀን ቀረው",
    expiresToday: "ዛሬ ያበቃል",
    starts: "{date} ይጀምራል",
    ended: "{date} አብቅቷል",
  },
  validity: {
    validThrough: "እስከ {date} ድረስ የሚሰራ ነው።",
    validToday: "አባልነቱ ዛሬ የሚሰራ ነው።",
    expiresToday: "ዛሬ የሚሰራ ነው፤ ዛሬ {date} ያበቃል።",
    starts: "አባልነቱ {date} ይጀምራል። እስከዚያ ድረስ የጂም መግቢያ የለም።",
    scheduled: "የወደፊት አባልነት ታቅዷል።",
    expiredOn: "አባልነቱ {date} አብቅቷል።",
    expired: "አባልነቱ አብቅቷል።",
    unpaid: "እስካሁን የተከፈለበት አባልነት የለም።",
  },
  archived: "በማህደር የተቀመጠ",
  paid: "ተከፍሏል",
  readOnly: "ለንባብ ብቻ",
  periodStatus: { CURRENT: "የአሁኑ", UPCOMING: "የታቀደ", ENDED: "ያበቃ" },
  gender: { MALE: "ወንድ", FEMALE: "ሴት", unspecified: "አልተገለጸም" },
  roles: {
    /** The gym owner's account (always an administrator). */
    superAdmin: "ዋና አስተዳዳሪ",
    ADMINISTRATOR: {
      label: "አስተዳዳሪ",
      description: "ዕቅዶችን፣ ሪፖርቶችን፣ ሠራተኞችንና የጂም ቅንብሮችን ጨምሮ ሙሉ መዳረሻ።",
    },
    RECEPTIONIST: {
      label: "እንግዳ ተቀባይ",
      description: "አባላትን መፈለግ፣ መመዝገብና ማስተካከል፣ ክፍያ መመዝገብና ደረሰኝ ማተም።",
    },
  },
  methods: {
    CASH: {
      label: "ጥሬ ገንዘብ",
      referenceHint: "ለጥሬ ገንዘብ አማራጭ ነው።",
      description: "በመቀበያው የተቀበለ ጥሬ ገንዘብ።",
    },
    BANK_TRANSFER: {
      label: "የባንክ ዝውውር",
      referenceHint: "የባንክ ግብይት ቁጥር፣ ለምሳሌ FT2628012345።",
      description: "ወደ ጂሙ የባንክ ሂሳብ የተደረገ ዝውውር። የባንክ ግብይት ማጣቀሻ ያስፈልጋል።",
    },
    CARD: {
      label: "ካርድ",
      referenceHint: "የካርድ ማሽኑ የፈቃድ ኮድ።",
      description: "በጂሙ የካርድ ማሽን የተፈጸመ ክፍያ። የማሽኑ የፈቃድ ኮድ ያስፈልጋል።",
    },
    MOBILE_PAYMENT: {
      label: "የሞባይል ክፍያ",
      referenceHint: "የሞባይል ገንዘብ ግብይት መለያ ቁጥር።",
      description: "በሞባይል ገንዘብ የተፈጸመ ክፍያ። የግብይቱ መለያ ቁጥር ያስፈልጋል።",
    },
  },
};
