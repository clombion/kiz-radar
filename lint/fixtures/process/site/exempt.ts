// Exempt: the rule is the tests', and the site has no process (tsconfig.json's types), which tsc refuses.
export const mode = process.env['NODE_ENV'];
