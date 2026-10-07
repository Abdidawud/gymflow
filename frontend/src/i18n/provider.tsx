"use client";

import { createContext, Fragment, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, readStoredLocale, type Locale } from "./config";
import { getTranslator, type Translator } from "./translator";
import type { MessageKey, MessageValues } from "./types";

const CHANGE_EVENT = "gymflow-locale-change";
const EXPLICIT_CHOICE_KEY = "gymflow-locale-chosen";

type RichTags = Record<string, (chunks: string) => ReactNode>;

export interface I18n extends Translator {
  /** Translate a message containing <tag>…</tag> markup into React nodes. */
  rich: (key: MessageKey, tags: RichTags, values?: MessageValues) => ReactNode;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Switch the interface language on this device. `explicit` marks a choice made
 * before signing in, so it can be saved to the account after sign-in.
 */
export function setLocale(locale: Locale, options: { explicit?: boolean } = {}) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    if (options.explicit) window.sessionStorage.setItem(EXPLICIT_CHOICE_KEY, "1");
  } catch {
    // Storage blocked: the choice applies to this page only.
  }
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** True once if the language was chosen on the sign-in screens in this tab. */
export function consumeExplicitLocaleChoice(): boolean {
  try {
    const chosen = window.sessionStorage.getItem(EXPLICIT_CHOICE_KEY) === "1";
    window.sessionStorage.removeItem(EXPLICIT_CHOICE_KEY);
    return chosen;
  } catch {
    return false;
  }
}

function renderRich(text: string, tags: RichTags): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const render = tags[match[1]];
    nodes.push(<Fragment key={match.index}>{render ? render(match[2]) : match[2]}</Fragment>);
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readStoredLocale, () => DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(() => {
    const translator = getTranslator(locale);
    return {
      ...translator,
      rich: (key, tags, values) => renderRich(translator.t(key, values), tags),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}

/** Sets the browser tab title, e.g. "Members · GymFlow". */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · GymFlow`;
  }, [title]);
}
