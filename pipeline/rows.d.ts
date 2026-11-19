// pipeline/rows.js, as the recipe test calls it: the row selector, and each field as records.Find has it
export interface Find {
  readonly css: string | null;
  readonly attr?: string | null;
  readonly match?: string | null;
  readonly page?: boolean;
  readonly up?: string;
  readonly all?: boolean;
}
declare const rows: (args: readonly [string, Readonly<Record<string, Find | null>>]) => Record<string, string | null>[];
export default rows;
