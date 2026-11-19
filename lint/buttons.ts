// A button is made by dom.ts's button(), which gives it type=button, so it never submits a form: h() called with the
// tag 'button' in the site's modules is refused, however the call is written (optional, with type arguments, h in
// parentheses) and however the tag is (a template without values, in parentheses, as const). .oxlintrc.json turns
// the rule on for site/*.ts and off for dom.ts.
import { callRule, stringOf } from './shapes.ts';

export const buttons = callRule(
  'buttons',
  'A button is made by dom.ts button(), which gives it type=button, so it never submits a form.',
  (call) => {
    const tag = call.arguments.at(0);
    return (
      call.callee.type === 'Identifier' && call.callee.name === 'h' && tag !== undefined && stringOf(tag) === 'button'
    );
  },
);
