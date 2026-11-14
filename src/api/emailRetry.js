const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

const isOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

const isTransientError = (error) => {
  if (isOffline()) return true;
  const status = Number(error?.status ?? error?.statusCode);
  if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
  const message = String(error?.message || error?.text || "");
  return /network|fetch|timeout|timed out|connection|temporar|unavailable|load failed/i.test(message);
};

const abortError = () => {
  const error = new Error("Email delivery was cancelled.");
  error.name = "AbortError";
  return error;
};

const waitForRetry = (delay, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      if (typeof removeEventListener === "function") {
        removeEventListener("online", onOnline);
      }
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onOnline = () => finish();
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    if (!isOffline()) timer = setTimeout(finish, delay);
    if (typeof addEventListener === "function") {
      addEventListener("online", onOnline, { once: true });
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function sendWithRetry(send, {
  signal,
  onRetry,
  maxAttempts = Number.POSITIVE_INFINITY,
} = {}) {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw abortError();
    try {
      return await send();
    } catch (error) {
      if (error?.name === "AbortError" || !isTransientError(error) || attempt + 1 >= maxAttempts) {
        throw error;
      }

      onRetry?.(error, attempt + 1);
      const delay = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * (2 ** attempt));
      attempt += 1;
      await waitForRetry(Math.round(delay * (0.8 + Math.random() * 0.4)), signal);
    }
  }
}
