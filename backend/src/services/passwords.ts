/**
 * Argon2id password hashing (backend design §12: memory-hard, never
 * reversible). Parameters follow the OWASP baseline (19 MiB, t=2, p=1).
 */

import { hash, verify } from "@node-rs/argon2";
import { meetsPasswordPolicy, PASSWORD_MAX_LENGTH } from "@gymflow/shared/domain/password";

const OPTIONS = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX_LENGTH * 4) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Spends the same time as a real check when the account doesn't exist, so
 * response timing doesn't reveal which emails have accounts.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("gymflow-timing-equalizer");
  await verifyPassword(await dummyHash, password);
}

export { meetsPasswordPolicy };
