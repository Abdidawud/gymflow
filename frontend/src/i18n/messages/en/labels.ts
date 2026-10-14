export const labels = {
  status: {
    ACTIVE: "Active",
    EXPIRING_SOON: "Expiring Soon",
    EXPIRED: "Expired",
    SCHEDULED: "Scheduled",
    UNPAID: "Unpaid",
  },
  detail: {
    daysLeft: { one: "{count} day left", other: "{count} days left" },
    daysLeftShort: "{count}d left",
    expiresToday: "Expires today",
    starts: "Starts {date}",
    ended: "Ended {date}",
  },
  validity: {
    validThrough: "Valid through {date}.",
    validToday: "Membership is valid today.",
    expiresToday: "Valid today. Expires today, {date}.",
    starts: "Membership starts on {date}. No gym access until then.",
    scheduled: "A future membership is scheduled.",
    expiredOn: "Membership expired on {date}.",
    expired: "Membership expired.",
    unpaid: "No paid membership yet.",
  },
  archived: "Archived",
  paid: "Paid",
  readOnly: "Read-only",
  periodStatus: { CURRENT: "Current", UPCOMING: "Scheduled", ENDED: "Ended" },
  gender: { MALE: "Male", FEMALE: "Female", unspecified: "Not specified" },
  roles: {
    /** The gym owner's account (always an administrator). */
    superAdmin: "Super admin",
    ADMINISTRATOR: {
      label: "Administrator",
      description: "Full access, including plans, reports, staff and gym settings.",
    },
    RECEPTIONIST: {
      label: "Receptionist",
      description: "Look up members, register and edit members, record payments and print receipts.",
    },
  },
  methods: {
    CASH: {
      label: "Cash",
      referenceHint: "Optional for cash.",
      description: "Cash received at the front desk.",
    },
    BANK_TRANSFER: {
      label: "Bank Transfer",
      referenceHint: "Bank transaction number, e.g. FT2628012345.",
      description: "Transfer to the gym's bank account. Requires the bank transaction reference.",
    },
    CARD: {
      label: "Card",
      referenceHint: "Card terminal authorization code.",
      description: "Card payment on the gym's terminal. Requires the terminal authorization code.",
    },
    MOBILE_PAYMENT: {
      label: "Mobile Payment",
      referenceHint: "Mobile money transaction ID.",
      description: "Mobile money payment. Requires the mobile money transaction ID.",
    },
  },
} as const;
