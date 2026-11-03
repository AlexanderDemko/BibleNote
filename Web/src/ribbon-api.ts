export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function postBibleNoteJson(
  apiUrl: string,
  pathname: string,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const url = new URL(pathname, `${apiUrl.replace(/\/+$/, '')}/`);
  const response = await fetchImpl(url, {
    method:'POST',
    signal:AbortSignal.timeout(120_000)
  });
  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
    throw new Error(`BibleNote API returned an invalid JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(body?.error || body?.title || text || `HTTP ${response.status}`);
  }
  return body as Record<string, unknown>;
}

export function quickAnalyzeCurrentPage(
  apiUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return postBibleNoteJson(
    apiUrl,
    '/api/OneNoteIntegration/QuickAnalyzeCurrentPage',
    fetchImpl
  );
}
