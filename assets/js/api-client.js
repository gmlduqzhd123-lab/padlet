import { requestApi } from "./padlet-api.js";

export function abortError() {
  return new DOMException("작업 취소", "AbortError");
}
export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
export function retryDelay(value, now = Date.now()) {
  if (!value) return 60000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.max(1000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - now) : 60000;
}
export function createApiClient(
  key,
  {
    fetcher = fetch,
    signal,
    wait = delay,
    now = Date.now,
    onProgress = () => {},
    interval = 1000,
  } = {},
) {
  let next = 0;
  return async (path) => {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw abortError();
      await wait(Math.max(0, next - now()), signal);
      next = now() + interval;
      try {
        return await requestApi(path, typeof key === "function" ? key() : key, {
          fetcher,
          signal,
        });
      } catch (error) {
        if (signal?.aborted || error.name === "AbortError") throw abortError();
        const retry429 = error.httpStatus === 429 && attempt < 2;
        const retry5xx =
          error.httpStatus >= 500 && error.httpStatus <= 599 && attempt < 3;
        if (!retry429 && !retry5xx) throw error;
        const pause = retry429
          ? retryDelay(error.retryAfter, now())
          : 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
        onProgress({
          phase: "waiting",
          reason: retry429 ? "429 요청량 제한" : "일시적인 서버 오류",
          waitMs: pause,
          attempt: attempt + 1,
        });
        await wait(pause, signal);
      }
    }
  };
}
