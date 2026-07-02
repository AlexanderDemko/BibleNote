import { setTimeout as delay } from 'node:timers/promises';
import { acquireTokenSilent } from './auth.js';

const graphRoot = 'https://graph.microsoft.com/v1.0';
let tokenResultPromise: ReturnType<typeof acquireTokenSilent> | undefined;
let graphRequestGate: Promise<void> = Promise.resolve();
let nextGraphRequestAt = 0;
let adaptiveMinIntervalMs = 0;

export type GraphRetryEvent = {
  status: number;
  attempt: number;
  maxAttempts: number;
  retryAfterMs: number;
};

let graphRetryObserver: ((event: GraphRetryEvent) => void) | undefined;

export function setGraphRetryObserver(observer?: (event: GraphRetryEvent) => void): void {
  graphRetryObserver = observer;
}

function configuredMinIntervalMs(): number {
  const value = Number(process.env.ONENOTE_GRAPH_MIN_INTERVAL_MS ?? '750');
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 60_000) : 750;
}

async function waitForGraphRequestSlot(): Promise<void> {
  const previous = graphRequestGate;
  let release!: () => void;
  graphRequestGate = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, nextGraphRequestAt - Date.now());
    if (waitMs > 0) await delay(waitMs);
    nextGraphRequestAt = Date.now() + Math.max(configuredMinIntervalMs(), adaptiveMinIntervalMs);
  } finally {
    release();
  }
}

function increaseAdaptiveInterval(): void {
  const current = Math.max(configuredMinIntervalMs(), adaptiveMinIntervalMs);
  adaptiveMinIntervalMs = Math.min(10_000, Math.ceil(current * 1.6));
}

function relaxAdaptiveInterval(): void {
  const base = configuredMinIntervalMs();
  if (adaptiveMinIntervalMs > base) adaptiveMinIntervalMs = Math.max(base, Math.floor(adaptiveMinIntervalMs * 0.97));
}

function extendGlobalBackoff(delayMs: number): void {
  nextGraphRequestAt = Math.max(nextGraphRequestAt, Date.now() + Math.max(0, delayMs));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfterMs = response.headers.get('x-ms-retry-after-ms');
  if (retryAfterMs && /^\d+$/.test(retryAfterMs)) return Number(retryAfterMs);
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  const retryAfterDateMs = retryAfter ? Date.parse(retryAfter) - Date.now() : Number.NaN;
  if (Number.isFinite(retryAfterDateMs)) return Math.max(0, retryAfterDateMs);
  const base = response.status === 429 ? 2_000 : 750;
  const cap = response.status === 429 ? 120_000 : 30_000;
  return Math.min(cap, base * 2 ** (attempt - 1));
}

async function accessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) tokenResultPromise = undefined;
  if (!tokenResultPromise) {
    tokenResultPromise = acquireTokenSilent(forceRefresh).catch(error => {
      tokenResultPromise = undefined;
      throw error;
    });
  }

  const result = await tokenResultPromise;
  const expiresAt = result.expiresOn?.getTime();
  if (expiresAt != null && expiresAt <= Date.now() + 5 * 60 * 1000) {
    tokenResultPromise = undefined;
    return accessToken(true);
  }
  const token = result.accessToken.trim();
  if (!token) throw new Error('MSAL returned an empty Microsoft Graph access token. Run: npm run login');
  return token;
}

export type GraphCollection<T> = {
  value: T[];
  '@odata.nextLink'?: string;
};

function graphUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith('https://') ? pathOrUrl : `${graphRoot}${pathOrUrl}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null) {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string') return causeCode;
  }
  return undefined;
}

function isTransientFetchError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  const code = errorCode(error);
  return [
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_CONNECT_TIMEOUT'
  ].includes(code ?? '')
    || message === 'terminated'
    || message.includes('socket')
    || message.includes('timeout')
    || message.includes('network')
    || message.includes('fetch failed');
}

function fetchErrorDelayMs(attempt: number): number {
  return Math.min(30_000, 750 * 2 ** (attempt - 1));
}

async function graphFetchText(pathOrUrl: string, accept: string): Promise<string> {
  let token = await accessToken();
  const url = graphUrl(pathOrUrl);
  const configuredAttempts = Number(process.env.ONENOTE_GRAPH_MAX_ATTEMPTS ?? '10');
  const maxAttempts = Number.isInteger(configuredAttempts) && configuredAttempts > 0
    ? configuredAttempts
    : 10;
  const configuredThrottleAttempts = Number(process.env.ONENOTE_GRAPH_MAX_THROTTLE_ATTEMPTS ?? '100');
  const maxThrottleAttempts = Number.isInteger(configuredThrottleAttempts) && configuredThrottleAttempts > 0
    ? configuredThrottleAttempts
    : 100;

  let lastResponseText = '';
  let authenticationRefreshAttempted = false;
  let transientAttempts = 0;
  let throttleAttempts = 0;
  while (true) {
    await waitForGraphRequestSlot();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept
        }
      });
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      transientAttempts += 1;
      if (transientAttempts >= maxAttempts) {
        throw new Error(`Graph request failed after ${maxAttempts} attempts: ${errorMessage(error)}`);
      }
      const waitMs = fetchErrorDelayMs(transientAttempts) + Math.floor(Math.random() * 250);
      extendGlobalBackoff(waitMs);
      graphRetryObserver?.({ status: 0, attempt: transientAttempts, maxAttempts, retryAfterMs: waitMs });
      continue;
    }

    let responseText = '';
    try {
      responseText = await response.text();
    } catch (error) {
      if (!isTransientFetchError(error)) throw error;
      transientAttempts += 1;
      if (transientAttempts >= maxAttempts) {
        throw new Error(`Graph response body failed after ${maxAttempts} attempts: ${errorMessage(error)}`);
      }
      const waitMs = fetchErrorDelayMs(transientAttempts) + Math.floor(Math.random() * 250);
      extendGlobalBackoff(waitMs);
      graphRetryObserver?.({ status: response.status || 0, attempt: transientAttempts, maxAttempts, retryAfterMs: waitMs });
      continue;
    }

    if (response.ok) {
      relaxAdaptiveInterval();
      return responseText;
    }

    lastResponseText = responseText;
    if (response.status === 401 && !authenticationRefreshAttempted) {
      authenticationRefreshAttempted = true;
      token = await accessToken(true);
      continue;
    }
    if (response.status === 429) {
      throttleAttempts += 1;
      if (throttleAttempts >= maxThrottleAttempts) {
        throw new Error(`Graph remained throttled after ${maxThrottleAttempts} attempts: ${lastResponseText}`);
      }
      increaseAdaptiveInterval();
      const waitMs = retryDelayMs(response, throttleAttempts) + Math.floor(Math.random() * 250);
      extendGlobalBackoff(waitMs);
      graphRetryObserver?.({ status: response.status, attempt: throttleAttempts, maxAttempts: maxThrottleAttempts, retryAfterMs: waitMs });
      continue;
    }

    const shouldRetry = [408, 500, 502, 503, 504].includes(response.status);
    if (!shouldRetry) {
      throw new Error(`Graph returned ${response.status} ${response.statusText}: ${lastResponseText}`);
    }
    transientAttempts += 1;
    if (transientAttempts >= maxAttempts) {
      throw new Error(`Graph returned ${response.status} after ${maxAttempts} attempts: ${lastResponseText}`);
    }
    const waitMs = retryDelayMs(response, transientAttempts) + Math.floor(Math.random() * 250);
    extendGlobalBackoff(waitMs);
    graphRetryObserver?.({ status: response.status, attempt: transientAttempts, maxAttempts, retryAfterMs: waitMs });
  }
}

export async function graphJson<T>(pathOrUrl: string): Promise<T> {
  const text = await graphFetchText(pathOrUrl, 'application/json');
  return JSON.parse(text) as T;
}

export async function graphText(pathOrUrl: string): Promise<string> {
  return graphFetchText(pathOrUrl, 'text/html');
}

export async function graphListAll<T>(
  pathOrUrl: string,
  options: {
    maxItems?: number;
    onPage?: (items: T[], nextLink?: string) => void;
    onFinished?: (complete: boolean) => void;
  } = {}
): Promise<T[]> {
  const all: T[] = [];
  let next: string | undefined = pathOrUrl;
  const visited = new Set<string>();

  while (next) {
    if (visited.has(next)) throw new Error(`Graph pagination loop detected at: ${next}`);
    visited.add(next);
    const data: GraphCollection<T> = await graphJson<GraphCollection<T>>(next);
    const items = data.value ?? [];
    all.push(...items);
    const nextLink = data['@odata.nextLink'];
    options.onPage?.(items, nextLink);

    if (options.maxItems && all.length >= options.maxItems) {
      options.onFinished?.(!nextLink && all.length <= options.maxItems);
      return all.slice(0, options.maxItems);
    }

    next = nextLink;
  }

  options.onFinished?.(true);
  return all;
}

export function encodeODataValue(value: string): string {
  // OData string literal escaping: single quote is doubled.
  return value.replaceAll("'", "''");
}
