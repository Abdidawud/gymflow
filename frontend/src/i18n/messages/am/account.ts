import type { Messages } from "../../types";

export const account: Messages["account"] = {
  title: "የእኔ መለያ",
  subtitle: "መገለጫዎ፣ የይለፍ ቃልዎ፣ ቋንቋና ገጽታ።",
  managedNote: "ስምዎ፣ ኢሜይልዎና ሚናዎ በጂሙ አስተዳዳሪ ይተዳደራሉ።",
  language: {
    title: "ቋንቋ",
    description: "በሁሉም ገጾችና በሚታተሙ ደረሰኞች ላይ ይውላል። በመለያዎ ይቀመጣል።",
    hints: { am: "የአማርኛ ገጽታ", en: "ነባሪ ቋንቋ" },
  },
  appearance: {
    title: "ገጽታ",
    description: "በመለያዎ ይቀመጣል።",
    LIGHT: { label: "ብሩህ", description: "ብርሃን ለበዛባቸው የእንግዳ መቀበያ ቦታዎች" },
    DARK: { label: "ጨለማ", description: "ለዝቅተኛ ብርሃንና ለምሽት ፈረቃዎች" },
    SYSTEM: { label: "እንደ መሣሪያው", description: "የዚህን መሣሪያ ቅንብር ይከተላል" },
  },
  signOut: {
    title: "ውጣ",
    description: "በዚህ መሣሪያ ላይ ያለዎን ክፍለ ጊዜ ያብቁ።",
    button: "ውጣ",
  },
  demo: {
    title: "የማሳያ መረጃ",
    badge: "የማሳያ ሁነታ",
    description: "የናሙና አባላትን፣ ክፍያዎችንና ቅንብሮችን ወደ ነበሩበት ይመልሱ። ከሲስተሙ ይወጣሉ።",
    button: "የማሳያ መረጃን ዳግም አስጀምር",
    confirmTitle: "የማሳያ መረጃውን ዳግም ያስጀምራሉ?",
    confirmText: "በማሳያ ሁነታ የተደረጉ ለውጦች በሙሉ በመጀመሪያው የናሙና መረጃ ይተካሉ።",
  },
  password: {
    title: "የይለፍ ቃል ቀይር",
    description: "በሌላ ቦታ የማይጠቀሙበትን የይለፍ ቃል ይጠቀሙ።",
    current: "የአሁኑ የይለፍ ቃል",
    new: "አዲስ የይለፍ ቃል",
    confirm: "የይለፍ ቃሉን ያረጋግጡ",
    submit: "የይለፍ ቃል አዘምን",
    updating: "በማዘመን ላይ…",
    updated: "የይለፍ ቃሉ ተዘምኗል።",
    updatedHint: "በመለያዎ የገቡ ሌሎች መሣሪያዎች እንዲወጡ ተደርጓል።",
    failed: "የይለፍ ቃሉን ማዘመን አልተቻለም። እንደገና ይሞክሩ።",
    errors: {
      current: "የአሁኑን የይለፍ ቃልዎን ያስገቡ።",
      same: "ከአሁኑ የተለየ የይለፍ ቃል ይምረጡ።",
    },
  },
};
