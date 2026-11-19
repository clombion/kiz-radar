// The libraries index.html loads as scripts from vendor/, copied there from the packages package.json pins:
// Leaflet's L and sql.js's initSqlJs are globals their own types declare; topojson-client's types declare a module.
/// <reference types="leaflet" />
// oxlint-disable-next-line import/no-namespace -- a type-only import of a module the page loads as a global: erased, nothing to tree-shake
import type * as TopoJSON from 'topojson-client';

declare global {
  const topojson: typeof TopoJSON;
}
