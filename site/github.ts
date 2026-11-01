// The review dashboard's writes: each claim a file of the claims repository, put at the path its digest names
// (PUT /repos/<repository>/contents/<digest>.json, with no sha), so writing a claim again finds its file there and
// changes nothing, and two claims never share a file. The token is the admin's (fine-grained, the claims repository
// only, Contents read and write), kept for this tab only.
import { type Claim, claimText, digest } from './claims.ts';
import { send } from './net.ts';

const TOKEN = 'kiz-radar-claims-token';
const API = 'https://api.github.com';

export function token(): string | null {
  try {
    return sessionStorage.getItem(TOKEN);
  } catch {
    return null; // storage refused (a private window, say): the page asks again
  }
}
export function keepToken(t: string | null): void {
  try {
    if (t === null) sessionStorage.removeItem(TOKEN);
    else sessionStorage.setItem(TOKEN, t);
  } catch {
    // storage refused: the token lasts as long as the page
  }
}

export type Written = { id: string; status: 'written' | 'there' | 'refused' | 'forbidden' };

// the claim's text as base64 of its UTF-8, as the contents API takes a file
const base64 = (s: string): string =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(''));

export async function write(repository: string, claim: Claim, auth: string): Promise<Written> {
  const text = claimText(claim);
  const id = await digest(text);
  const r = await send(new URL(`/repos/${repository}/contents/${id}.json`, API), {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${auth}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ message: `Claim ${id}: ${claim.field} (review dashboard)`, content: base64(text) }),
    answers: [401, 403, 404, 422],
  });
  // 422: a file is at the path already, which names this claim's text: it is written
  const status = r.ok ? 'written' : r.status === 422 ? 'there' : r.status === 401 ? 'refused' : 'forbidden';
  return { id, status };
}
