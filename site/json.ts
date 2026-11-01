// JSON a build writes, read by its shape: each reader takes a value and where it is, and fails naming both when the
// value is not what the shape says, so nothing past the reader meets an unread value.
export type Reader<T> = (v: unknown, at: string) => T;
type Shape = Readonly<Record<string, Reader<unknown>>>;
export type Read<S extends Shape> = { -readonly [K in keyof S]: ReturnType<S[K]> };

const wrong = (at: string, v: unknown, what: string): never => {
  throw new TypeError(`${at}: ${v === undefined ? 'nothing' : JSON.stringify(v).slice(0, 60)} is no ${what}`);
};

export const text: Reader<string> = (v, at) => (typeof v === 'string' ? v : wrong(at, v, 'text'));
export const int: Reader<number> = (v, at) =>
  typeof v === 'number' && Number.isInteger(v) ? v : wrong(at, v, 'whole number');
export const nullable =
  <T>(read: Reader<T>): Reader<T | null> =>
  (v, at) =>
    v === null ? null : read(v, at);
export const list =
  <T>(read: Reader<T>): Reader<T[]> =>
  (v, at) =>
    Array.isArray(v) ? v.map((x: unknown, i) => read(x, `${at}[${i}]`)) : wrong(at, v, 'list');
export const record =
  <S extends Shape>(shape: S): Reader<Read<S>> =>
  (v, at) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return wrong(at, v, 'object');
    const out: Record<string, unknown> = {};
    for (const [name, read] of Object.entries(shape)) {
      if (!Object.hasOwn(v, name)) return wrong(`${at}.${name}`, undefined, 'field it has');
      out[name] = read(Reflect.get(v, name), `${at}.${name}`);
    }
    // biome-ignore lint/nursery/noUnsafeTypeAssertion: every field of the shape was read into out, by its own reader
    return out as Read<S>;
  };
