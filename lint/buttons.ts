// A button is made by dom.ts's button(), which gives it type=button, so it never submits a form: h('button', …) in the
// site's modules is refused. .oxlintrc.json turns the rule on for site/*.ts and off for dom.ts.
import { callRule, callsName } from './shapes.ts';

export const buttons = callRule(
  'buttons',
  'A button is made by dom.ts button(), which gives it type=button, so it never submits a form.',
  (call) => {
    const tag = call.arguments.at(0);
    return callsName(call, 'h') && tag?.type === 'Literal' && tag.value === 'button';
  },
);
