const LIVE_ATTENDANCE_API_URL = "https://lewissee.onrender.com/attendance";
const LIVE_LIVENESS_API_URL = "https://liveliness-server.vercel.app/liveness";

const isLocalUrl = (url) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(String(url || "").trim());

const endpoint = () => {
  const attendanceUrl = import.meta.env.VITE_ATTENDANCE_API_URL?.trim();
  if (attendanceUrl && !isLocalUrl(attendanceUrl)) return attendanceUrl;

  const livenessUrl = import.meta.env.VITE_LIVENESS_API_URL?.trim();
  if (livenessUrl && !isLocalUrl(livenessUrl)) {
    return `${livenessUrl.replace(/\/liveness\/?$/, "").replace(/\/$/, "")}/attendance`;
  }

  return LIVE_ATTENDANCE_API_URL || `${LIVE_LIVENESS_API_URL.replace(/\/liveness\/?$/, "")}/attendance`;
};

const REQUEST_TIMEOUT_MS = 20000;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const RETRYABLE_STATUSES = new Set([408, 429]);

const makeError = (message, retryable = false) => {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
};

const abortError = () => {
  const error = new Error("Attendance API request was cancelled.");
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
      removeEventListener("online", onOnline);
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

    timer = setTimeout(finish, delay);
    addEventListener("online", onOnline, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const request = async (method, body, { signal, onRetry } = {}) => {
  const url = endpoint();
  let attempt = 0;

  while (true) {
    if (signal?.aborted) throw abortError();
    let failure;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      failure = makeError("Internet connection is offline.", true);
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const abortRequest = () => controller.abort();
      signal?.addEventListener("abort", abortRequest, { once: true });

      try {
        let response;
        try {
          response = await fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } catch {
          if (signal?.aborted) throw abortError();
          failure = makeError(
            controller.signal.aborted
              ? "Attendance API request timed out."
              : "Could not reach the live attendance API.",
            true,
          );
        }

        if (response) {
          if (!response.ok) {
            let detail = `Attendance API returned ${response.status}.`;
            try {
              const payload = await response.json();
              detail = payload.detail || payload.message || detail;
            } catch {
              if (controller.signal.aborted) {
                failure = makeError("Attendance API request timed out.", true);
              }
            }
            if (!failure) {
              failure = makeError(
                detail,
                RETRYABLE_STATUSES.has(response.status) || response.status >= 500,
              );
            }
          } else {
            try {
              return await response.json();
            } catch (cause) {
              if (signal?.aborted) throw abortError();
              if (controller.signal.aborted) {
                failure = makeError("Attendance API request timed out.", true);
              } else if (cause instanceof SyntaxError) {
                throw new Error("Attendance API returned an invalid response.");
              } else {
                failure = makeError("Connection interrupted while reading the attendance API response.", true);
              }
            }
          }
        }
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", abortRequest);
      }
    }

    if (!failure?.retryable) throw failure || new Error("Unable to reach the attendance API.");
    onRetry?.(failure, attempt + 1);
    const backoff = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * (2 ** attempt));
    const jitteredDelay = Math.round(backoff * (0.8 + Math.random() * 0.4));
    attempt += 1;
    await waitForRetry(jitteredDelay, signal);
  }
};

let saveQueue = Promise.resolve();

export const loadAttendanceStore = (options) => request("GET", undefined, options);
export const saveAttendanceStore = (store, options) => {
  const save = saveQueue.catch(() => {}).then(() => request("PUT", store, options));
  saveQueue = save;
  return save;
};
