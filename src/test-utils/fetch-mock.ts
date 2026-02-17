type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const withFetchPreconnect = <T extends FetchLike>(fn: T): T & { preconnect: () => void } =>
  Object.assign(fn, {
    preconnect: () => {},
  });
