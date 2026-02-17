export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type FetchMock = ReturnType<typeof import("vitest").vi.fn<FetchLike>>;

export const withFetchPreconnect = <T extends FetchLike>(fn: T): T & { preconnect: () => void } =>
  Object.assign(fn, {
    preconnect: () => {},
  });
