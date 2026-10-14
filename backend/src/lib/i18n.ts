/**
 * API messages in the request's language (Accept-Language: am | en), worded
 * exactly like the web app (frontend/src/i18n/messages) so a server error reads
 * the same as a field check in the browser. Dates use the Ethiopian calendar.
 */

import type { DateOnly } from "@gymflow/shared/domain/dates";
import { formatDate } from "@gymflow/shared/i18n/format";
import { isLocale, type Locale } from "@gymflow/shared/i18n/locales";

const en = {
  // Request handling
  checkFields: "Check the highlighted fields.",
  malformed: "The request couldn't be read. Reload the page and try again.",
  invalidValue: "Enter a valid value.",
  unknownField: "This field isn't accepted.",
  routeNotFound: "This endpoint doesn't exist.",
  payloadTooLarge: "The upload is too large.",
  internal: "Something went wrong on our side. Try again.",
  csrf: "Your session couldn't be verified. Reload the page and try again.",
  originForbidden: "Requests from this site aren't allowed.",
  unavailable: "GymFlow is temporarily unavailable. Try again shortly.",

  // Authentication
  unauthenticated: "Sign in to continue.",
  sessionExpired: "Your session expired. Sign in again.",
  invalidCredentials: "Email or password is incorrect.",
  deactivated: "This account has been deactivated. Contact your gym administrator.",
  passwordChangeRequired: "Change your temporary password to continue.",
  forbidden: "You don't have permission to do this.",
  rateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
  tooManyRequests: "Too many requests. Wait a moment and try again.",
  invalidResetToken: "This reset link has expired or is invalid. Request a new link.",
  currentPasswordWrong: "Current password is incorrect.",
  passwordSame: "Choose a password different from the current one.",
  passwordPolicy: "Use at least 8 characters with a letter and a number or symbol.",
  chooseAppearance: "Choose an appearance.",
  chooseLanguage: "Choose a language.",

  // Shared field checks
  notFound: "This record could not be found.",
  formerStaff: "Former staff member",
  maxLength: "Use {max} characters or fewer.",
  emailInvalid: "Enter a valid email address.",
  phoneInvalid: "Enter a valid Ethiopian phone number.",
  mobileInvalid: "Enter a valid Ethiopian mobile number, for example 0911 234 567.",
  validOption: "Choose a valid option.",
  validDates: "Choose valid dates.",
  fromAfterTo: "The From date must be on or before the To date.",
  rangeTooLong: "Choose a range of one year or less.",

  // Members and photos
  firstName: "Enter the first name.",
  lastName: "Enter the last name.",
  emergencyPhone: "Enter the emergency contact's phone, or clear the name.",
  emergencyName: "Enter the emergency contact's name, or clear the phone.",
  duplicatePhone: "This phone number is already assigned to another member.",
  duplicatePhoneField: "Already assigned to {name} ({code}).",
  photoMissing: "Choose an image to upload.",
  photoType: "Choose a JPEG, PNG or WebP image.",
  photoSize: "This image is too large. Choose a smaller one.",
  photoInvalid: "This file isn't a valid image. Choose another photo.",
  photoUnreadable: "This image couldn't be read. Choose another photo.",

  // Plans
  planName: "Enter a plan name.",
  planNameTaken: "A plan with this name already exists.",
  planPrice: "Enter a positive amount with at most two decimal places.",
  planDuration: "Enter a whole number of days from 1 to 3650.",
  planNotFound: "This plan could not be found.",

  // Payments
  memberArchived: "This member is archived. Reactivate the member before recording a payment.",
  planDisabled: "This plan is disabled and can't be purchased.",
  chooseEnabledPlan: "Choose an enabled plan.",
  validStartDate: "Choose a valid start date.",
  startTooEarly: "Choose a start date within the last 12 months.",
  startTooFar: "Choose a start date within the next 12 months.",
  overlap: "These dates overlap the membership from {start} to {end}.",
  overlapField: "Overlaps {start} – {end}. Choose {suggested} or later.",
  choosePaymentMethod: "Choose a payment method.",
  methodDisabled: "This payment method is no longer enabled.",
  chooseEnabledMethod: "Choose an enabled payment method.",
  receivedDate: "Choose the date the payment was received.",
  receivedDateFuture: "Payment date can't be in the future.",
  reference: "Enter the transaction reference for this payment method.",
  missingIdempotencyKey: "Missing or invalid Idempotency-Key header.",
  idempotencyConflict: "This payment was already submitted with different details.",
  previewChanged: "Membership details changed since the preview. Review the updated details and confirm again.",

  // Staff and settings
  fullName: "Enter the full name.",
  chooseRole: "Choose a role.",
  duplicateEmail: "A staff account with this email already exists.",
  lastAdmin: "GymFlow needs at least one active administrator. Promote another staff member first.",
  lastAdminField: "This is the last active administrator.",
  lastAdminShort: "GymFlow needs at least one active administrator.",
  cantDeactivateSelf: "You can't deactivate your own account.",
  superAdminProtected: "Only the super administrator can change this account.",
  superAdminRole: "The super administrator always stays an active administrator.",
  gymName: "Enter the gym name.",
  warningDays: "Enter a whole number from 0 to 30.",
  atLeastOneMethod: "Keep at least one payment method enabled.",
  logoUrl: "Upload a logo instead of setting a link.",

  // Email
  resetSubject: "Reset your GymFlow password",
  resetBody:
    "Hello {name},\n\nSomeone asked to reset the password for your GymFlow account at {gym}. " +
    "Open this link to choose a new password:\n\n{link}\n\n" +
    "The link works once and expires in {minutes} minutes. If you didn't ask for this, ignore this email; " +
    "your password stays the same.\n\n— GymFlow",
} as const;

export type MessageKey = keyof typeof en;

const am: Record<MessageKey, string> = {
  checkFields: "ምልክት የተደረገባቸውን መስኮች ያረጋግጡ።",
  malformed: "ጥያቄውን ማንበብ አልተቻለም። ገጹን እንደገና ይጫኑና ይሞክሩ።",
  invalidValue: "ትክክለኛ ዋጋ ያስገቡ።",
  unknownField: "ይህ መስክ ተቀባይነት የለውም።",
  routeNotFound: "ይህ አድራሻ የለም።",
  payloadTooLarge: "የተሰቀለው ፋይል በጣም ትልቅ ነው።",
  internal: "በእኛ በኩል ችግር ተፈጥሯል። እንደገና ይሞክሩ።",
  csrf: "ክፍለ ጊዜዎን ማረጋገጥ አልተቻለም። ገጹን እንደገና ይጫኑና ይሞክሩ።",
  originForbidden: "ከዚህ ድረ-ገጽ የሚመጡ ጥያቄዎች አይፈቀዱም።",
  unavailable: "GymFlow ለጊዜው አይገኝም። ትንሽ ቆይተው ይሞክሩ።",

  unauthenticated: "ለመቀጠል ይግቡ።",
  sessionExpired: "ክፍለ ጊዜዎ አብቅቷል። እንደገና ይግቡ።",
  invalidCredentials: "ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።",
  deactivated: "ይህ መለያ ታግዷል። የጂሙን አስተዳዳሪ ያነጋግሩ።",
  passwordChangeRequired: "ለመቀጠል ጊዜያዊ የይለፍ ቃልዎን ይቀይሩ።",
  forbidden: "ይህን ለማድረግ ፈቃድ የለዎትም።",
  rateLimited: "በጣም ብዙ የመግቢያ ሙከራዎች ተደርገዋል። ጥቂት ደቂቃዎች ጠብቀው እንደገና ይሞክሩ።",
  tooManyRequests: "በጣም ብዙ ጥያቄዎች ተልከዋል። ትንሽ ጠብቀው እንደገና ይሞክሩ።",
  invalidResetToken: "ይህ የይለፍ ቃል መቀየሪያ ሊንክ ጊዜው አልፏል ወይም ትክክል አይደለም። አዲስ ሊንክ ይጠይቁ።",
  currentPasswordWrong: "የአሁኑ የይለፍ ቃል ትክክል አይደለም።",
  passwordSame: "ከአሁኑ የተለየ የይለፍ ቃል ይምረጡ።",
  passwordPolicy: "ቢያንስ 8 ቁምፊዎች ይጠቀሙ፤ ፊደልና ቁጥር ወይም ምልክት ይኑረው።",
  chooseAppearance: "ገጽታ ይምረጡ።",
  chooseLanguage: "ቋንቋ ይምረጡ።",

  notFound: "ይህ መዝገብ አልተገኘም።",
  formerStaff: "የቀድሞ ሠራተኛ",
  maxLength: "ከ{max} ቁምፊዎች አይብለጥ።",
  emailInvalid: "ትክክለኛ የኢሜይል አድራሻ ያስገቡ።",
  phoneInvalid: "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ።",
  mobileInvalid: "ትክክለኛ የኢትዮጵያ የሞባይል ቁጥር ያስገቡ፤ ለምሳሌ 0911 234 567።",
  validOption: "ትክክለኛ አማራጭ ይምረጡ።",
  validDates: "ትክክለኛ ቀኖችን ይምረጡ።",
  fromAfterTo: "የመጀመሪያው ቀን ከመጨረሻው ቀን በፊት ወይም ያው ቀን መሆን አለበት።",
  rangeTooLong: "አንድ ዓመት ወይም ከዚያ ያነሰ ክልል ይምረጡ።",

  firstName: "ስም ያስገቡ።",
  lastName: "የአባት ስም ያስገቡ።",
  emergencyPhone: "የተጠሪውን ስልክ ያስገቡ፤ ወይም ስሙን ያጥፉ።",
  emergencyName: "የተጠሪውን ስም ያስገቡ፤ ወይም ስልኩን ያጥፉ።",
  duplicatePhone: "ይህ ስልክ ቁጥር ለሌላ አባል ተመዝግቧል።",
  duplicatePhoneField: "ለ{name} ({code}) ተመዝግቧል።",
  photoMissing: "የሚሰቀል ምስል ይምረጡ።",
  photoType: "JPEG፣ PNG ወይም WebP ምስል ይምረጡ።",
  photoSize: "ምስሉ በጣም ትልቅ ነው። ያነሰ ምስል ይምረጡ።",
  photoInvalid: "ይህ ፋይል ትክክለኛ ምስል አይደለም። ሌላ ፎቶ ይምረጡ።",
  photoUnreadable: "ይህን ምስል ማንበብ አልተቻለም። ሌላ ፎቶ ይምረጡ።",

  planName: "የዕቅዱን ስም ያስገቡ።",
  planNameTaken: "በዚህ ስም ሌላ ዕቅድ አለ።",
  planPrice: "ከ2 አስርዮሽ ቦታ ያልበለጠ አዎንታዊ መጠን ያስገቡ።",
  planDuration: "ከ1 እስከ 3650 ያለ ሙሉ የቀን ቁጥር ያስገቡ።",
  planNotFound: "ይህ ዕቅድ አልተገኘም።",

  memberArchived: "ይህ አባል በማህደር ተቀምጧል። ክፍያ ከመመዝገብዎ በፊት አባሉን እንደገና ያንቁ።",
  planDisabled: "ይህ ዕቅድ ታግዷል፤ ሊገዛ አይችልም።",
  chooseEnabledPlan: "በሥራ ላይ ያለ ዕቅድ ይምረጡ።",
  validStartDate: "ትክክለኛ የመጀመሪያ ቀን ይምረጡ።",
  startTooEarly: "ባለፉት 12 ወራት ውስጥ ያለ የመጀመሪያ ቀን ይምረጡ።",
  startTooFar: "በሚቀጥሉት 12 ወራት ውስጥ ያለ የመጀመሪያ ቀን ይምረጡ።",
  overlap: "እነዚህ ቀናት ከ{start} እስከ {end} ካለው አባልነት ጋር ይደራረባሉ።",
  overlapField: "ከ{start} – {end} ጋር ይደራረባል። {suggested} ወይም ከዚያ በኋላ ያለ ቀን ይምረጡ።",
  choosePaymentMethod: "የክፍያ ዘዴ ይምረጡ።",
  methodDisabled: "ይህ የክፍያ ዘዴ ከአሁን በኋላ በሥራ ላይ አይደለም።",
  chooseEnabledMethod: "በሥራ ላይ ያለ የክፍያ ዘዴ ይምረጡ።",
  receivedDate: "ክፍያው የተቀበለበትን ቀን ይምረጡ።",
  receivedDateFuture: "የክፍያ ቀን ወደፊት ሊሆን አይችልም።",
  reference: "ለዚህ የክፍያ ዘዴ የግብይት ማጣቀሻውን ያስገቡ።",
  missingIdempotencyKey: "የIdempotency-Key ራስጌ አልተላከም ወይም ትክክል አይደለም።",
  idempotencyConflict: "ይህ ክፍያ ቀደም ሲል በተለያየ ዝርዝር ገብቷል።",
  previewChanged: "ከቅድመ እይታው በኋላ የአባልነት ዝርዝሮች ተቀይረዋል። የተዘመኑትን ዝርዝሮች ገምግመው እንደገና ያረጋግጡ።",

  fullName: "ሙሉ ስሙን ያስገቡ።",
  chooseRole: "ሚና ይምረጡ።",
  duplicateEmail: "በዚህ ኢሜይል የተመዘገበ የሠራተኛ መለያ አለ።",
  lastAdmin: "GymFlow ቢያንስ አንድ ንቁ አስተዳዳሪ ያስፈልገዋል። መጀመሪያ ሌላ ሠራተኛን አስተዳዳሪ ያድርጉ።",
  lastAdminField: "ይህ የመጨረሻው ንቁ አስተዳዳሪ ነው።",
  lastAdminShort: "GymFlow ቢያንስ አንድ ንቁ አስተዳዳሪ ያስፈልገዋል።",
  cantDeactivateSelf: "የራስዎን መለያ ማገድ አይችሉም።",
  superAdminProtected: "ይህን መለያ መቀየር የሚችለው ዋናው አስተዳዳሪ ብቻ ነው።",
  superAdminRole: "ዋናው አስተዳዳሪ ሁልጊዜ ንቁ አስተዳዳሪ ሆኖ ይቆያል።",
  gymName: "የጂሙን ስም ያስገቡ።",
  warningDays: "ከ0 እስከ 30 ያለ ሙሉ ቁጥር ያስገቡ።",
  atLeastOneMethod: "ቢያንስ አንድ የክፍያ ዘዴ በሥራ ላይ ይሁን።",
  logoUrl: "ሊንክ ከማስገባት ይልቅ አርማ ይስቀሉ።",

  resetSubject: "የGymFlow የይለፍ ቃልዎን ይቀይሩ",
  resetBody:
    "ሰላም {name}፣\n\nበ{gym} ያለው የGymFlow መለያዎ የይለፍ ቃል እንዲቀየር ተጠይቋል። " +
    "አዲስ የይለፍ ቃል ለመምረጥ ይህን ሊንክ ይክፈቱ፦\n\n{link}\n\n" +
    "ሊንኩ አንድ ጊዜ ብቻ ይሠራል፤ በ{minutes} ደቂቃ ውስጥ ጊዜው ያልፋል። ይህን ያልጠየቁ ከሆነ ኢሜይሉን ችላ ይበሉት፤ " +
    "የይለፍ ቃልዎ አይቀየርም።\n\n— GymFlow",
};

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { en, am };

export type MessageValues = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: MessageValues) => string;

export function translator(locale: Locale): Translate {
  const catalog = CATALOGS[locale];
  return (key, values) =>
    catalog[key].replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = values?.[name];
      if (value === undefined) return match;
      return typeof value === "number" ? value.toLocaleString("en-US") : value;
    });
}

/** Date in the Ethiopian calendar, as the web app shows it. */
export function dateText(locale: Locale, date: DateOnly): string {
  return formatDate(date, locale);
}

/**
 * Picks the response language from Accept-Language (the web app sends exactly
 * "am" or "en"); Amharic, the gym's working language, is the default.
 */
export function negotiateLocale(header: string | undefined, fallback: Locale = "am"): Locale {
  if (!header) return fallback;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return {
        language: tag.toLowerCase().split("-")[0],
        q: q ? Number(q.slice(2)) : 1,
      };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((entry) => entry.language).find(isLocale) ?? fallback;
}

export const MESSAGE_CATALOGS = CATALOGS;
