// The intended way in JSX: a button of type button, written as a string or in braces; any other element as it is.
export const close = <button type="button">Close</button>;
export const braced = <button type={'button'}>Close</button>;
declare const rest: { title: string };
export const spreadFirst = (
  <button {...rest} type="button">
    Close
  </button>
);
export const label = <span>Close</span>;
