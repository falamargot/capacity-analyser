module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  env: {
    browser: true,
    es2021: true
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  settings: {
    react: { version: 'detect' }
  },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  },
  ignorePatterns: ['dist']
};
