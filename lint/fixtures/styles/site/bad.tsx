// What house/styles refuses: the style prop, whatever it is given (Solid's compiler writes a string, and an object's
// constant values, into the template's HTML), and a style: prop.
declare const color: string;
declare const css: string;
declare const styleOf: (c: string) => Record<string, string>;
declare function Card(props: { style: string }): unknown;
export const quoted = <p style="color: red">x</p>; // refused
export const braced = <p style={'color: red'}>x</p>; // refused
export const templated = <p style={`color: ${color}`}>x</p>; // refused
export const named = <p style={css}>x</p>; // refused
export const called = <p style={styleOf(color)}>x</p>; // refused
export const constant = <p style={{ color: 'red' }}>x</p>; // refused
export const mixed = <p style={{ color: 'red', width: color }}>x</p>; // refused
export const dynamic = <p style={{ color }}>x</p>; // refused
export const property = <p style:color="red">x</p>; // refused
export const namespaced = <p prop:style={css}>x</p>; // refused
export const valueless = <p style>x</p>; // refused
export const passed = <Card style="color: red" />; // refused
