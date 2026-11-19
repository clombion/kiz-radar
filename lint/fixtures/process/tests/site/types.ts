// The intended way: a type's typeof process reads no value, so it needs no import.
export type Global = typeof process;
export type Env = typeof process.env;
