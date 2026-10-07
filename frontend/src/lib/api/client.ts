/**
 * The API instance the UI imports. NEXT_PUBLIC_API_MODE selects the
 * implementation at build time:
 *   - "http": the real backend at NEXT_PUBLIC_API_BASE_URL (default /api/v1)
 *   - "mock": an in-browser mock with the same contract and business rules
 *
 * The mock is loaded with a dynamic import so it is never downloaded in http mode.
 */

import type { GymFlowApi } from "./contract";
import { createHttpApi } from "./http-client";

export type ApiMode = "http" | "mock";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "http";

let implementation: Promise<GymFlowApi> | null = null;

function load(): Promise<GymFlowApi> {
  implementation ??=
    API_MODE === "mock"
      ? import("./mock/mock-api").then((module) => module.createMockApi())
      : Promise.resolve(createHttpApi());
  return implementation;
}

type Namespace = keyof GymFlowApi;

/**
 * `api.members.list(...)` resolves the implementation lazily, so callers use
 * one stable object regardless of mode.
 */
export const api = new Proxy({} as GymFlowApi, {
  get(_target, namespace: string) {
    return new Proxy(
      {},
      {
        get(_inner, method: string) {
          return async (...args: unknown[]) => {
            const impl = await load();
            const group = impl[namespace as Namespace] as unknown as Record<string, (...a: unknown[]) => unknown>;
            return group[method](...args);
          };
        },
      },
    );
  },
});
