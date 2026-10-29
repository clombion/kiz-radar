// Every request the site makes goes through get(): it gives up at its deadline, or as soon as the view that asked is
// left, and an answer that is no success throws, naming what was asked.
const DEADLINE = 60_000; // ms: the database is 3 MB, which a slow phone line takes some seconds over

export async function get(
  url: URL,
  { signal, revalidate }: { signal?: AbortSignal; revalidate?: true } = {},
): Promise<Response> {
  const deadline = AbortSignal.timeout(DEADLINE);
  const r = await fetch(url, {
    signal: signal === undefined ? deadline : AbortSignal.any([signal, deadline]),
    cache: revalidate === true ? 'no-cache' : 'default', // no-cache: asked again of the server, which says if it changed
  });
  if (!r.ok) throw new Error(`${url.pathname}: ${r.status} ${r.statusText}`);
  return r;
}
