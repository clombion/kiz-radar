// What house/json refuses, everywhere: a JSON module imported, or exported from, without { type: 'json' }.
import data from './data.json'; // refused
import { rows } from './data.json'; // refused
import * as all from './data.json'; // refused
import first, { second } from './data.json'; // refused
import './data.json'; // refused
import other from './data.json' with { other: 'x' }; // refused
import styled from './data.json' with { type: 'css' }; // refused
import packaged from 'package/data.json'; // refused

export { names } from './data.json'; // refused
export * from './data.json'; // refused
export { all, data, first, other, packaged, rows, second, styled };
