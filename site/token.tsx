// The review dashboard's token (review.html): what the page can do with it, in the words its button says, and the
// dialog that asks for one, checks it with GitHub and keeps it in this browser (kept.ts), or forgets it. The page
// (review.ts) holds the token's state and draws itself anew on each change of it; the dialog is given the page's two
// functions that change it. Drawn once, at the end of <body>, shown with showModal() and closed with close(), with no
// history entry of its own.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createSignal, flush } from 'solid-js';
import { expires, forgetToken, keepExpires, keepToken, remembered, token } from './kept.ts';
import { daysLeft } from './pending.ts';
import { done } from './report.ts';
import { plural } from './wording.ts';

const MINT = 'https://github.com/settings/personal-access-tokens/new';
const SOON = 14; // days before its expiry the token's state warns

// The token: missing, being checked, good (whose), or refused; the page can write only with a good one.
export type Access =
  | { readonly state: 'missing' }
  | { readonly state: 'checking' }
  | { readonly state: 'ok'; readonly login: string }
  | { readonly state: 'refused'; readonly why: string };

// what the token's button says of each state but a good token, which says whose and until when: one for each, or
// this fails to compile
const NOT_WRITING: Readonly<Record<Exclude<Access['state'], 'ok'>, string>> = {
  missing: 'Read-only · add a token',
  checking: 'Checking the token…',
  refused: 'Read-only · token refused',
};
// what the token's button says of access, a good token's expiry read as it is said (kept.ts)
export function accessWords(access: Access): string {
  if (access.state !== 'ok') return NOT_WRITING[access.state];
  const day = expires();
  if (day === null) return `Writing as ${access.login}`;
  const left = daysLeft(day, new Date());
  if (left < 0) return `Token expired on ${day}`;
  return `Writing as ${access.login} · ${plural(left, 'day')} left${left <= SOON ? ': make a new one soon' : ''}`;
}

// the dialog once drawn, which the token button and an item's "add a token" open
let drawn: HTMLDialogElement | undefined;
export const openToken = (): void => {
  drawn?.showModal();
};
export const tokenOpen = (): boolean => drawn?.open === true;

// a button of the dialog's beside its main one
const quiet = (words: string, act: () => void): JSX.Element => (
  <button type="button" class="quiet" onClick={act}>
    {words}
  </button>
);

// The dialog, for a token that may write to repository: check asks GitHub of a token and says what the page's state is
// then; forget leaves the page without one, after the dialog has forgotten it in this browser.
export function tokenDialog({
  repository,
  check,
  forget,
}: {
  readonly repository: string;
  readonly check: (t: string) => Promise<Access>;
  readonly forget: () => void;
}): JSX.Element {
  const [said, setSaid] = createSignal('');
  const say = (words: string) => {
    flush(() => {
      setSaid(words);
    });
  };
  let field: HTMLInputElement | undefined, day: HTMLInputElement | undefined, onDevice: HTMLInputElement | undefined;
  // what the fields hold as the dialog is drawn: the day kept, and whether the token is kept on this device
  const firstDay = expires() ?? '';
  const kept = remembered();
  // the token pasted, else the one the page has; checked, and kept as asked once GitHub names its owner
  const keepIt = () => {
    const t = (field?.value ?? '').trim() || token();
    if (t === null) {
      say('Paste the token first.');
      return;
    }
    say('Asking GitHub…');
    keepExpires((day?.value ?? '') === '' ? null : (day?.value ?? null));
    done(
      (async () => {
        const now = await check(t);
        if (now.state === 'ok') {
          keepToken(t, onDevice?.checked === true);
          // ticked only if the device kept it
          if (onDevice !== undefined) onDevice.checked = remembered();
          if (field !== undefined) field.value = '';
          say(`${accessWords(now)}: the choices are on each item.`);
        } else say(now.state === 'refused' ? now.why : '');
      })(),
      'checking the token',
    );
  };
  return (
    <dialog
      ref={(el) => {
        drawn = el;
      }}
      class="review-dialog"
      aria-labelledby="token-title"
    >
      <h2 id="token-title">A token to write claims</h2>
      <ol class="small">
        <li>
          {/* oxlint-disable-next-line react/jsx-no-target-blank -- the link's rel kept as the h() page drew it during the port, noopener alone (revisit after 4.10) */}
          <a href={MINT} target="_blank" rel="noopener">
            Make a fine-grained token
          </a>
          {' on GitHub.'}
        </li>
        <li>
          {'Repository access: only '}
          <code>{repository}</code>.
        </li>
        <li>Permissions: Contents, Read and write; nothing else.</li>
        <li>Any expiry: enter the day GitHub shows, so this page can remind you.</li>
      </ol>
      <label class="review-field">
        <span>Token</span>
        <input
          ref={(el) => {
            field = el;
          }}
          type="password"
          autocomplete="off"
          aria-label="Token"
          placeholder="github_pat_…"
        />
      </label>
      <label class="review-field">
        <span>Expires on</span>
        <input
          ref={(el) => {
            day = el;
          }}
          type="date"
          aria-label="Expires on"
          defaultValue={firstDay}
        />
      </label>
      <label class="review-check">
        <input
          ref={(el) => {
            onDevice = el;
          }}
          type="checkbox"
          defaultChecked={kept}
        />
        {' Keep it on this device (otherwise for this tab only)'}
      </label>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the dialog's status line, its markup kept as the h() page drew it during the port (revisit after 4.10) */}
      <p class="review-status" role="status">
        {said()}
      </p>
      <div class="review-actions">
        <button type="button" onClick={keepIt}>
          Check and keep
        </button>
        {quiet('Forget', () => {
          forgetToken();
          forget();
          say('Forgotten: the page is read-only.');
        })}
        {quiet('Close', () => {
          drawn?.close();
        })}
      </div>
    </dialog>
  );
}
