/**
 * Deterministic demo dataset for Adama Fitness, consistent with the design
 * fixtures (design.md §5): Abebe, Hana, Dawit, Sara and Meron keep their exact
 * IDs, phones, plans and periods; everyone else is generated from a seed.
 *
 * Status targets on the fixture date (non-archived members):
 *   350 total = 286 active + 20 expiring soon + 35 expired + 8 unpaid + 1 scheduled
 * plus 6 archived members whose financial history is preserved.
 */

import type { Gender, PaymentMethod } from "../api/types";
import { addDays, daysBetween, type DateOnly } from "../domain/dates";
import { membershipEndDate } from "../domain/membership";
import { gymTimestamp, SEED_TODAY } from "./clock";
import { DEMO_STAFF_IDS, demoId, demoMemberId } from "./ids";
import type {
  DemoDataset,
  MemberRecord,
  MembershipRecord,
  PaymentRecord,
  PlanRecord,
  SettingsRecord,
  StaffRecord,
} from "./records";
import { createRng, type Rng } from "./rng";

export const DEMO_PASSWORD = "GymFlow#2026";
export const DEMO_TEMPORARY_PASSWORD = "Welcome#2026";

const GYM_OPENED: DateOnly = "2025-01-06";

const MALE_NAMES = [
  "Abel",
  "Amanuel",
  "Biruk",
  "Bereket",
  "Dagim",
  "Dereje",
  "Ermias",
  "Eyob",
  "Fitsum",
  "Girma",
  "Henok",
  "Kirubel",
  "Kaleb",
  "Mikiyas",
  "Mulugeta",
  "Nahom",
  "Natnael",
  "Robel",
  "Samuel",
  "Solomon",
  "Tewodros",
  "Yared",
  "Yonas",
  "Yohannes",
  "Gemechu",
  "Tolosa",
  "Obsa",
  "Kedir",
  "Jemal",
  "Ahmed",
  "Mohammed",
  "Gadisa",
  "Tolera",
  "Feyisa",
  "Lemma",
  "Haile",
  "Bekele",
  "Tamrat",
  "Surafel",
  "Elias",
  "Nebiyu",
  "Leul",
  "Abenezer",
] as const;

const FEMALE_NAMES = [
  "Almaz",
  "Aster",
  "Betelhem",
  "Bethlehem",
  "Eden",
  "Elsa",
  "Eyerusalem",
  "Feven",
  "Hana",
  "Helen",
  "Hiwot",
  "Kalkidan",
  "Kidist",
  "Liya",
  "Lidya",
  "Mahlet",
  "Mekdes",
  "Meron",
  "Meskerem",
  "Mihret",
  "Rahel",
  "Ruth",
  "Samrawit",
  "Saron",
  "Selamawit",
  "Tigist",
  "Tsion",
  "Chaltu",
  "Bontu",
  "Hawi",
  "Lensa",
  "Ebise",
  "Fatuma",
  "Hayat",
  "Sara",
  "Lemlem",
  "Yeshi",
  "Bezawit",
  "Nardos",
  "Rediet",
  "Firehiwot",
  "Meseret",
  "Zufan",
] as const;

const FATHER_NAMES = [
  "Kebede",
  "Tesfaye",
  "Bekele",
  "Mohammed",
  "Alemu",
  "Worku",
  "Teshome",
  "Assefa",
  "Girma",
  "Haile",
  "Tadesse",
  "Desta",
  "Mekonnen",
  "Wolde",
  "Gebre",
  "Abate",
  "Ayele",
  "Getachew",
  "Negash",
  "Lemma",
  "Tefera",
  "Hailu",
  "Kassa",
  "Demissie",
  "Shiferaw",
  "Mengistu",
  "Abera",
  "Belay",
  "Ahmed",
  "Kedir",
  "Jemal",
  "Tolosa",
  "Gemechu",
  "Fayisa",
  "Dinka",
  "Gudeta",
  "Megersa",
  "Abdisa",
  "Debela",
  "Tesfaye",
  "Birhanu",
  "Yilma",
  "Asfaw",
] as const;

const SUB_CITIES = ["Bole", "Abba Gadaa", "Boku Shanan", "Dabe", "Dembela", "Lugo"] as const;
const RELATIONSHIPS = ["Spouse", "Sister", "Brother", "Mother", "Father", "Friend", "Cousin"] as const;
const EMAIL_DOMAINS = ["gmail.com", "gmail.com", "gmail.com", "yahoo.com", "outlook.com"] as const;
const NOTES = [
  "Prefers morning sessions before work.",
  "Knee injury last year; avoids heavy squats.",
  "Student at Adama Science and Technology University.",
  "Referred by a current member.",
  "Trains with a personal coach on weekends.",
  "Usually pays by bank transfer from CBE.",
] as const;

type PlanKey = "daily" | "weekly" | "monthly" | "quarter" | "half" | "annual" | "student";

const PLAN_DEFS: Record<PlanKey, Omit<PlanRecord, "createdAt" | "updatedAt">> = {
  daily: {
    id: demoId("plan", 1),
    name: "Daily Pass",
    price: "150.00",
    durationDays: 1,
    description: "Single-day access for walk-ins and guests.",
    isEnabled: true,
  },
  weekly: {
    id: demoId("plan", 2),
    name: "Weekly",
    price: "500.00",
    durationDays: 7,
    description: "Seven consecutive days of full gym access.",
    isEnabled: true,
  },
  monthly: {
    id: demoId("plan", 3),
    name: "Monthly",
    price: "1500.00",
    durationDays: 30,
    description: "Thirty consecutive days of full gym access. The most popular plan.",
    isEnabled: true,
  },
  quarter: {
    id: demoId("plan", 4),
    name: "3 Months",
    price: "4000.00",
    durationDays: 90,
    description: "Ninety days of access at a lower daily rate than monthly.",
    isEnabled: true,
  },
  half: {
    id: demoId("plan", 5),
    name: "6 Months",
    price: "7500.00",
    durationDays: 180,
    description: "One hundred eighty days of access for committed members.",
    isEnabled: true,
  },
  annual: {
    id: demoId("plan", 6),
    name: "Annual",
    price: "14000.00",
    durationDays: 365,
    description: "A full year of access at the best daily rate.",
    isEnabled: true,
  },
  student: {
    id: demoId("plan", 7),
    name: "Student Monthly",
    price: "1200.00",
    durationDays: 30,
    description: "Discontinued student offer. Kept for purchase history.",
    isEnabled: false,
  },
};

const DAWIT_DEACTIVATED: DateOnly = "2026-05-31";

const STAFF: StaffRecord[] = [
  staff(DEMO_STAFF_IDS.abdi, "Abdi Dawud", "abdi@adamafitness.com", "ADMINISTRATOR", true, false, "2025-01-02"),
  staff(DEMO_STAFF_IDS.tigist, "Tigist Haile", "tigist@adamafitness.com", "RECEPTIONIST", true, false, "2025-01-03"),
  staff(DEMO_STAFF_IDS.dawit, "Dawit Tadesse", "dawit.t@adamafitness.com", "RECEPTIONIST", false, false, "2025-02-10"),
  staff(DEMO_STAFF_IDS.selam, "Selam Girma", "selam@adamafitness.com", "RECEPTIONIST", true, true, "2026-10-05"),
];

function staff(
  id: string,
  fullName: string,
  email: string,
  role: StaffRecord["role"],
  isActive: boolean,
  mustChangePassword: boolean,
  created: DateOnly,
): StaffRecord {
  return {
    id,
    fullName,
    email,
    password: mustChangePassword ? DEMO_TEMPORARY_PASSWORD : DEMO_PASSWORD,
    role,
    isActive,
    mustChangePassword,
    // The demo owner is the super administrator.
    isSuperAdmin: id === DEMO_STAFF_IDS.abdi,
    appearance: "SYSTEM",
    language: "am",
    lastSignInAt: mustChangePassword ? null : gymTimestamp(isActive ? SEED_TODAY : DAWIT_DEACTIVATED, "07:55"),
    createdAt: gymTimestamp(created, "09:00"),
    updatedAt: gymTimestamp(isActive ? created : DAWIT_DEACTIVATED, "17:30"),
  };
}

interface PlannedPeriod {
  plan: PlanKey;
  startDate: DateOnly;
  endDate: DateOnly;
  /** Payment details; generated when omitted. */
  receivedDate?: DateOnly;
  method?: PaymentMethod;
  time?: string;
  recordedBy?: string;
}

interface PlannedMember {
  member: Omit<MemberRecord, "id" | "memberCode" | "createdAt" | "updatedAt">;
  periods: PlannedPeriod[];
  fixedCode?: number;
}

type Target = "ACTIVE" | "ACTIVE_PREPAID" | "EXPIRING" | "EXPIRED" | "UNPAID" | "ARCHIVED";

const TARGETS: [Target, number][] = [
  ["ACTIVE", 279],
  ["ACTIVE_PREPAID", 6],
  ["EXPIRING", 19],
  ["EXPIRED", 34],
  ["UNPAID", 7],
  ["ARCHIVED", 6],
];

const FIXTURE_CODES = new Set([124, 125, 126, 127, 128]);

/** The demo gym as of the fixture date. Deterministic: every call returns the same data. */
export function generateDemoData(): DemoDataset {
  const rng = createRng(20261007);
  const today = SEED_TODAY;
  const usedPhones = new Set<string>(["911234567", "922456789", "933567890", "944678901", "955789012", "912345678"]);

  const planned: PlannedMember[] = [...fixtureMembers()];
  for (const [target, count] of TARGETS) {
    for (let i = 0; i < count; i++) planned.push(generateMember(rng, target, today, usedPhones));
  }

  // Member codes follow registration order; the design fixtures keep GYM-00124…00128.
  const generated = planned.filter((p) => p.fixedCode === undefined);
  generated.sort((a, b) => (a.member.registrationDate < b.member.registrationDate ? -1 : 1));
  let nextCode = 1;
  for (const entry of generated) {
    while (FIXTURE_CODES.has(nextCode)) nextCode++;
    entry.fixedCode = nextCode++;
  }

  const members: MemberRecord[] = [];
  const memberships: MembershipRecord[] = [];
  const payments: Omit<PaymentRecord, "paymentCode">[] = [];
  let membershipSeq = 1;

  for (const entry of planned) {
    const code = entry.fixedCode!;
    const memberId = demoMemberId(code);
    const createdAt = gymTimestamp(
      entry.member.registrationDate,
      `${String(rng.int(7, 19)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}`,
    );
    members.push({
      ...entry.member,
      id: memberId,
      memberCode: `GYM-${String(code).padStart(5, "0")}`,
      createdAt,
      updatedAt: entry.member.archivedAt ?? createdAt,
    });

    const sorted = [...entry.periods].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    sorted.forEach((period, index) => {
      const def = PLAN_DEFS[period.plan];
      const membershipId = demoId("membership", membershipSeq);
      const paymentId = demoId("payment", membershipSeq);
      membershipSeq++;

      const previous = sorted[index - 1];
      const receivedDate =
        period.receivedDate ?? chooseReceivedDate(rng, period, previous, entry.member.registrationDate, today);
      const time =
        period.time ?? `${String(rng.int(6, 20)).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}`;
      // A few payments are entered the day after they were received.
      const enteredLate = !period.time && rng.chance(0.03) && receivedDate < today;
      const createdAtPayment = gymTimestamp(enteredLate ? addDays(receivedDate, 1) : receivedDate, time);
      const method = period.method ?? chooseMethod(rng);

      memberships.push({
        id: membershipId,
        memberId,
        planId: def.id,
        planNameSnapshot: def.name,
        priceSnapshot: def.price,
        durationDaysSnapshot: def.durationDays,
        startDate: period.startDate,
        endDate: period.endDate,
        isRenewal: index > 0,
        createdAt: createdAtPayment,
      });
      payments.push({
        id: paymentId,
        memberId,
        membershipId,
        amount: def.price,
        currency: "ETB",
        method,
        receivedDate,
        reference: referenceFor(rng, method),
        notes: method === "CASH" && rng.chance(0.08) ? "Paid at the front desk." : null,
        recordedBy: period.recordedBy ?? chooseRecorder(rng, receivedDate),
        createdAt: createdAtPayment,
      });
    });
  }

  // Payment codes follow entry order; Abebe's Oct 01 payment is PAY-10234 (design.md §13).
  payments.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const anchorIndex = payments.findIndex((p) => p.memberId === demoMemberId(124) && p.receivedDate === "2026-10-01");
  const base = 10234 - anchorIndex;
  const codedPayments: PaymentRecord[] = payments.map((p, index) => ({
    ...p,
    paymentCode: `PAY-${String(base + index).padStart(5, "0")}`,
  }));

  const plans: PlanRecord[] = (Object.keys(PLAN_DEFS) as PlanKey[]).map((key) => ({
    ...PLAN_DEFS[key],
    createdAt: gymTimestamp(key === "student" ? "2025-01-06" : "2025-01-05", "10:00"),
    updatedAt: gymTimestamp(key === "student" ? "2025-09-01" : "2025-01-05", "10:00"),
  }));

  const settings: SettingsRecord = {
    gymName: "Adama Fitness",
    phone: "+251221118920",
    email: "info@adamafitness.com",
    address: "Bole Sub-city, Kebele 03, near Adama Stadium, Adama",
    logoUrl: null,
    expirationWarningDays: 7,
    enabledPaymentMethods: ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_PAYMENT"],
    updatedAt: gymTimestamp("2026-09-15", "16:20"),
    updatedBy: DEMO_STAFF_IDS.abdi,
  };

  return {
    staff: STAFF.map((s) => ({ ...s })),
    members,
    plans,
    memberships,
    payments: codedPayments,
    settings,
    counters: {
      member: Math.max(...members.map((m) => Number(m.memberCode.slice(4)))),
      payment: base + codedPayments.length - 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Design fixtures (design.md §5)
// ---------------------------------------------------------------------------

function fixtureMembers(): PlannedMember[] {
  const blank = {
    photoUrl: null,
    isArchived: false,
    archivedAt: null,
  };
  return [
    {
      fixedCode: 124,
      member: {
        ...blank,
        firstName: "Abebe",
        lastName: "Kebede",
        phone: "+251911234567",
        email: "abebe.k@gmail.com",
        gender: "MALE",
        emergencyName: "Almaz Kebede",
        emergencyPhone: "+251912345678",
        emergencyRelationship: "Sister",
        address: "Bole Sub-city, Kebele 08, near Adama Stadium",
        notes: "Prefers morning strength training sessions.",
        registrationDate: "2026-07-02",
      },
      periods: [
        {
          plan: "monthly",
          startDate: "2026-07-03",
          endDate: "2026-08-01",
          method: "CASH",
        },
        {
          plan: "monthly",
          startDate: "2026-08-02",
          endDate: "2026-08-31",
          method: "MOBILE_PAYMENT",
        },
        {
          plan: "monthly",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          method: "CASH",
        },
        {
          plan: "monthly",
          startDate: "2026-10-01",
          endDate: "2026-10-30",
          receivedDate: "2026-10-01",
          method: "CASH",
          time: "09:15",
          recordedBy: DEMO_STAFF_IDS.abdi,
        },
      ],
    },
    {
      fixedCode: 125,
      member: {
        ...blank,
        firstName: "Hana",
        lastName: "Tesfaye",
        phone: "+251922456789",
        email: "hana.t@outlook.com",
        gender: "FEMALE",
        emergencyName: "Yared Tesfaye",
        emergencyPhone: "+251921556677",
        emergencyRelationship: "Brother",
        address: "Dabe Sub-city, Adama",
        notes: null,
        registrationDate: "2026-04-11",
      },
      periods: [
        {
          plan: "quarter",
          startDate: "2026-04-14",
          endDate: "2026-07-12",
          method: "BANK_TRANSFER",
        },
        {
          plan: "quarter",
          startDate: "2026-07-13",
          endDate: "2026-10-10",
          method: "BANK_TRANSFER",
          receivedDate: "2026-07-11",
        },
      ],
    },
    {
      fixedCode: 126,
      member: {
        ...blank,
        firstName: "Dawit",
        lastName: "Bekele",
        phone: "+251933567890",
        email: "dawit.bekele@gmail.com",
        gender: "MALE",
        emergencyName: null,
        emergencyPhone: null,
        emergencyRelationship: null,
        address: null,
        notes: null,
        registrationDate: "2026-06-29",
      },
      periods: [
        {
          plan: "monthly",
          startDate: "2026-07-01",
          endDate: "2026-07-30",
          method: "CASH",
        },
        {
          plan: "monthly",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          method: "CASH",
          receivedDate: "2026-09-01",
        },
      ],
    },
    {
      fixedCode: 127,
      member: {
        ...blank,
        firstName: "Sara",
        lastName: "Mohammed",
        phone: "+251944678901",
        email: "sara.m@yahoo.com",
        gender: "FEMALE",
        emergencyName: null,
        emergencyPhone: null,
        emergencyRelationship: null,
        address: null,
        notes: "Registered at the front desk; will pay on her first visit.",
        registrationDate: "2026-10-06",
      },
      periods: [],
    },
    {
      fixedCode: 128,
      member: {
        ...blank,
        firstName: "Meron",
        lastName: "Alemu",
        phone: "+251955789012",
        email: "meron.a@gmail.com",
        gender: "FEMALE",
        emergencyName: "Tsion Alemu",
        emergencyPhone: "+251955112233",
        emergencyRelationship: "Mother",
        address: "Lugo Sub-city, Adama",
        notes: null,
        registrationDate: "2026-10-05",
      },
      periods: [
        {
          plan: "monthly",
          startDate: "2026-10-12",
          endDate: "2026-11-10",
          receivedDate: "2026-10-05",
          method: "MOBILE_PAYMENT",
          time: "17:40",
          recordedBy: DEMO_STAFF_IDS.tigist,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Generated members
// ---------------------------------------------------------------------------

const ACTIVE_PLANS: [PlanKey, number][] = [
  ["monthly", 62],
  ["quarter", 20],
  ["half", 10],
  ["annual", 8],
];
const EXPIRING_PLANS: [PlanKey, number][] = [
  ["monthly", 60],
  ["weekly", 22],
  ["quarter", 13],
  ["daily", 5],
];
const ANY_PLANS: [PlanKey, number][] = [
  ["monthly", 55],
  ["weekly", 14],
  ["quarter", 13],
  ["daily", 8],
  ["half", 6],
  ["annual", 4],
];

function period(plan: PlanKey, startDate: DateOnly): PlannedPeriod {
  return {
    plan,
    startDate,
    endDate: membershipEndDate(startDate, PLAN_DEFS[plan].durationDays),
  };
}

function periodEnding(plan: PlanKey, endDate: DateOnly): PlannedPeriod {
  return {
    plan,
    startDate: addDays(endDate, 1 - PLAN_DEFS[plan].durationDays),
    endDate,
  };
}

function generateMember(rng: Rng, target: Target, today: DateOnly, usedPhones: Set<string>): PlannedMember {
  const gender: Gender = rng.chance(0.52) ? "MALE" : "FEMALE";
  const firstName = rng.pick(gender === "MALE" ? MALE_NAMES : FEMALE_NAMES);
  const lastName = rng.pick(FATHER_NAMES);
  const phone = uniquePhone(rng, usedPhones);

  let latest: PlannedPeriod[] = [];
  switch (target) {
    case "ACTIVE": {
      const plan = rng.weighted(ACTIVE_PLANS);
      const remaining = rng.int(8, PLAN_DEFS[plan].durationDays - 1);
      latest = [periodEnding(plan, addDays(today, remaining))];
      break;
    }
    case "ACTIVE_PREPAID": {
      // Paid a back-to-back renewal early: covered continuously well past the warning window.
      const current = periodEnding("monthly", addDays(today, rng.int(1, 6)));
      latest = [current, period("monthly", addDays(current.endDate, 1))];
      latest[1].receivedDate = addDays(today, -rng.int(0, 3));
      break;
    }
    case "EXPIRING": {
      const plan = rng.weighted(EXPIRING_PLANS);
      const remaining = rng.int(0, Math.min(7, PLAN_DEFS[plan].durationDays - 1));
      latest = [periodEnding(plan, addDays(today, remaining))];
      break;
    }
    case "EXPIRED": {
      const plan = rng.weighted(ANY_PLANS);
      const ago = rng.weighted<[number, number]>([
        [[1, 30], 50],
        [[31, 90], 30],
        [[91, 300], 20],
      ]);
      latest = [periodEnding(plan, addDays(today, -rng.int(ago[0], ago[1])))];
      break;
    }
    case "ARCHIVED": {
      const plan = rng.weighted(ANY_PLANS);
      latest = [periodEnding(plan, addDays(today, -rng.int(120, 420)))];
      break;
    }
    case "UNPAID":
      latest = [];
      break;
  }

  const periods = [...latest];
  let registrationDate: DateOnly;
  if (periods.length === 0) {
    registrationDate = addDays(today, -rng.int(1, 40));
  } else {
    const earliestStart = periods[0].startDate;
    const span = Math.max(0, daysBetween(GYM_OPENED, earliestStart));
    const historyFloor = addDays(GYM_OPENED, rng.int(0, span));
    const loyalty = target === "EXPIRED" || target === "ARCHIVED" ? 0.55 : 0.78;
    let cursor = periods[0];
    while (rng.chance(loyalty)) {
      // The discontinued student plan only appears in older history.
      const choices: [PlanKey, number][] =
        cursor.startDate < "2025-09-01" ? [...ANY_PLANS, ["student", 12]] : ANY_PLANS;
      const plan: PlanKey = rng.chance(0.8) ? cursor.plan : rng.weighted(choices);
      const contiguous = rng.chance(plan === "daily" ? 0.1 : plan === "weekly" ? 0.45 : 0.7);
      const gap = contiguous ? 0 : rng.int(3, 45);
      const previous = periodEnding(plan, addDays(cursor.startDate, -1 - gap));
      if (previous.startDate < historyFloor || previous.startDate < GYM_OPENED) break;
      periods.unshift(previous);
      cursor = previous;
    }
    const firstStart = periods[0].startDate;
    registrationDate = addDays(firstStart, -rng.int(0, 2));
    if (registrationDate < GYM_OPENED) registrationDate = GYM_OPENED;
  }

  const hasEmergency = rng.chance(0.6);
  let archivedAt: string | null = null;
  if (target === "ARCHIVED") {
    const archivedOn = addDays(latest[0].endDate, rng.int(30, 90));
    archivedAt = gymTimestamp(archivedOn < today ? archivedOn : addDays(today, -3), "11:00");
  }

  return {
    member: {
      firstName,
      lastName,
      phone,
      email: rng.chance(0.55) ? emailFor(rng, firstName, lastName) : null,
      gender: rng.chance(0.9) ? gender : null,
      photoUrl: null,
      emergencyName: hasEmergency ? `${rng.pick(rng.chance(0.5) ? MALE_NAMES : FEMALE_NAMES)} ${lastName}` : null,
      emergencyPhone: hasEmergency ? `+251${uniquePhone(rng, usedPhones).slice(4)}` : null,
      emergencyRelationship: hasEmergency ? rng.pick(RELATIONSHIPS) : null,
      address: rng.chance(0.5)
        ? `${rng.pick(SUB_CITIES)} Sub-city, Kebele ${String(rng.int(1, 14)).padStart(2, "0")}, Adama`
        : null,
      notes: rng.chance(0.15) ? rng.pick(NOTES) : null,
      isArchived: target === "ARCHIVED",
      archivedAt,
      registrationDate,
    },
    periods,
  };
}

function uniquePhone(rng: Rng, used: Set<string>): string {
  for (;;) {
    const prefix = rng.chance(0.85) ? `9${rng.int(1, 9)}` : `7${rng.int(0, 9)}`;
    const national = `${prefix}${String(rng.int(0, 9_999_999)).padStart(7, "0")}`;
    if (!used.has(national)) {
      used.add(national);
      return `+251${national}`;
    }
  }
}

function emailFor(rng: Rng, first: string, last: string): string {
  const style = rng.int(0, 2);
  const local =
    style === 0 ? `${first}.${last[0]}` : style === 1 ? `${first}${last}` : `${first}.${last}${rng.int(1, 99)}`;
  return `${local.toLowerCase()}@${rng.pick(EMAIL_DOMAINS)}`;
}

function chooseReceivedDate(
  rng: Rng,
  current: PlannedPeriod,
  previous: PlannedPeriod | undefined,
  registrationDate: DateOnly,
  today: DateOnly,
): DateOnly {
  let received = current.startDate;
  const contiguous = previous && addDays(previous.endDate, 1) === current.startDate;
  if (contiguous && rng.chance(0.45)) received = addDays(current.startDate, -rng.int(1, 5));
  if (previous && received <= previous.startDate) received = addDays(previous.startDate, 1);
  if (received < registrationDate) received = registrationDate;
  if (received > today) received = today;
  return received;
}

function chooseMethod(rng: Rng): PaymentMethod {
  return rng.weighted<PaymentMethod>([
    ["CASH", 50],
    ["BANK_TRANSFER", 22],
    ["MOBILE_PAYMENT", 20],
    ["CARD", 8],
  ]);
}

function referenceFor(rng: Rng, method: PaymentMethod): string | null {
  const digits = (n: number) => Array.from({ length: n }, () => rng.int(0, 9)).join("");
  switch (method) {
    case "CASH":
      return null;
    case "BANK_TRANSFER":
      return `FT${digits(10)}`;
    case "MOBILE_PAYMENT":
      return `TXN${digits(9)}`;
    case "CARD":
      return `POS-${digits(6)}`;
  }
}

function chooseRecorder(rng: Rng, receivedDate: DateOnly): string {
  if (receivedDate <= DAWIT_DEACTIVATED && receivedDate >= "2025-02-10" && rng.chance(0.25))
    return DEMO_STAFF_IDS.dawit;
  return rng.chance(0.62) ? DEMO_STAFF_IDS.tigist : DEMO_STAFF_IDS.abdi;
}
