// Every request the site makes goes through get() or send(): it gives up at its deadline, or as soon as the view that
// asked is left, and an answer that is no success throws, naming what was asked, unless the caller names it as one of
// the answers it reads.
const DEADLINE = 60_000; // ms: the database is 3 MB, which a slow phone line takes some seconds over

interface Asked {
  signal?: AbortSignal | undefined;
  answers?: readonly number[]; // statuses that are no success but an answer the caller reads
}

async function ask(url: URL, init: RequestInit, { signal, answers = [] }: Asked): Promise<Response> {
  const deadline = AbortSignal.timeout(DEADLINE);
  const r = await fetch(url, {
    ...init,
    signal: signal === undefined ? deadline : AbortSignal.any([signal, deadline]),
  });
  if (!(r.ok || answers.includes(r.status))) throw new Error(`${url.pathname}: ${r.status} ${r.statusText}`);
  return r;
}

export const get = (
  url: URL,
  { signal, revalidate, headers, answers }: Asked & { revalidate?: true; headers?: Record<string, string> } = {},
): Promise<Response> =>
  // no-cache: asked again of the server, which says if it changed
  ask(
    url,
    { cache: revalidate === true ? 'no-cache' : 'default', headers: headers ?? {} },
    { signal, answers: answers ?? [] },
  );

export const send = (
  url: URL,
  { method, headers, body, answers }: { method: 'PUT'; headers: Record<string, string>; body: string } & Asked,
): Promise<Response> => ask(url, { method, headers, body, cache: 'no-store' }, { answers: answers ?? [] });
