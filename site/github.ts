// The review dashboard's requests to GitHub. A claim is written as a file of the claims repository, put at the path its
// digest names (PUT /repos/<repository>/contents/<digest>.json, with no sha), so writing a claim again finds its file
// there and changes nothing, and two claims never share a file. A token is checked by asking GitHub whose it is: no
// request short of a write shows what a fine-grained token may write, so the first claim shows that.
import { type Claim, claimText, digest } from './claims.ts';
import { get, send } from './net.ts';

const API = 'https://api.github.com';
const headers = (auth: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${auth}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

export type Checked = { status: 'ok'; login: string } | { status: 'refused' };
export async function check(auth: string): Promise<Checked> {
  const r = await get(new URL('/user', API), { headers: headers(auth), answers: [401, 403] });
  if (!r.ok) return { status: 'refused' };
  const body: unknown = await r.json();
  const login = typeof body === 'object' && body !== null && 'login' in body ? String(body.login) : '';
  return { status: 'ok', login };
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
    headers: headers(auth),
    body: JSON.stringify({ message: `Claim ${id}: ${claim.field} (review dashboard)`, content: base64(text) }),
    answers: [401, 403, 404, 422],
  });
  // 422: a file is at the path already, which names this claim's text: it is written
  const status = r.ok ? 'written' : r.status === 422 ? 'there' : r.status === 401 ? 'refused' : 'forbidden';
  return { id, status };
}
