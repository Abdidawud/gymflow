import type { en } from "./messages/en";

/** A message that varies by count; `one`/`other` follow Intl.PluralRules for the locale. */
export interface Plural {
  readonly one: string;
  readonly other: string;
}

type Widen<T> = T extends string ? string : T extends Plural ? Plural : { readonly [K in keyof T]: Widen<T[K]> };

/** Shape every catalog must match: the English catalog with its literal strings widened. */
export type Messages = Widen<typeof en>;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural ? Join<P, K> : Paths<T[K], Join<P, K>>;
}[keyof T & string];

/** Every valid "namespace.key" path, checked at compile time. */
export type MessageKey = Paths<Messages>;

export type MessageValues = Record<string, string | number>;
