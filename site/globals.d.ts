// The libraries index.html loads from cdnjs and jsDelivr as scripts, at the versions package.json pins their types to:
// Leaflet's L and sql.js's initSqlJs are globals their own types declare; topojson-client's types declare a module.
/// <reference types="leaflet" />
import type * as TopoJSON from 'topojson-client';

declare global {
  const topojson: typeof TopoJSON;
}
