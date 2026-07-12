/* ESLint config (legacy .eslintrc for ESLint 8). */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    // Enforce CLAUDE.md §6: no `any` unless justified with a comment.
    '@typescript-eslint/no-explicit-any': 'warn',
    // Allow intentionally-unused args/vars when prefixed with `_`
    // (e.g. Express's required 4-arg error-middleware signature).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
