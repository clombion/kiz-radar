// pipeline/rows.js, as the recipe test calls it: the row selector, and each field as records.Find has it
export interface Find {
  css: string | null;
  attr?: string | null;
  match?: string | null;
  page?: boolean;
  up?: string;
  all?: boolean;
}
declare const rows: (args: [string, Record<string, Find | null>]) => Record<string, string | null>[];
export default rows;
