// The intended way: focus moved when the visitor acts; other attributes, one whose name holds focus among them.
declare const search: { focus(): void };
export const field = <input aria-label="Search" />;
export const opener = (
  <button type="button" onClick={() => search.focus()}>
    Search
  </button>
);
export const named = <input data-autofocus-off="" />;
