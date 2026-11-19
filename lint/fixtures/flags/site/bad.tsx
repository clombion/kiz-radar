// What house/flags refuses in a Solid file: a loading or failure state of its own, each name a declarator binds, in
// any case, with or without is, however the signal is made (with a type argument too), its setter alone, a function
// declared by the name, a class's field, private or not.
import { createSignal } from 'solid-js';

declare const state: { failed: boolean; fetching: boolean; rest: object };
export const [loading, setLoading] = createSignal(false); // refused: flags, flags
export const [isPending, setPending] = createSignal<boolean>(false); // refused: flags, flags
export const [, setBusy, busy = false] = [0, createSignal(0)[1]]; // refused: flags, flags
export const { failed } = state; // refused
export const { fetching: isFetching } = state; // refused
export const { ...error } = state; // refused
export const IsError = createSignal<string | undefined>(undefined); // refused
export function Card() {
  let loading = true; // refused
  const [ERROR] = createSignal(''); // refused
  return <p>{String(loading) + ERROR()}</p>;
}
export const [, setFetching] = createSignal(false); // refused
export const [, setIsBusy] = createSignal(false); // refused
export function isLoading(): void {} // refused
export class Panel {
  busy = false; // refused
  #failed = false; // refused
  static pending = 0; // refused
  get state(): boolean {
    return this.#failed;
  }
}
