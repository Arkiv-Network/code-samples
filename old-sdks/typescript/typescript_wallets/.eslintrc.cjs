module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint/eslint-plugin',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // IMPORTANT: This must be the last item in the extends array!
  ],
  env: {
    node: true, // Enables Node.js global variables and Node.js scoping.
    es2021: true, // Adds all ECMAScript 2021 globals and automatically sets the ecmaVersion parser option to 12.
  },
  rules: {
    // You can add or override specific ESLint rules here if needed
    // For example, if you want to enforce a rule Prettier doesn't care about.
  },
};