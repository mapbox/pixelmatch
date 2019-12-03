module.exports = {
  root: true,
  env: {
    browser: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module'
  },
  extends: ['plugin:@typescript-eslint/recommended'],
  "rules": {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    'no-useless-constructor': 'off',
    'no-unused-vars': 'warn',
    'no-undef': 'off',
    'no-new': 'off',
    'eol-last': 'off'
  }
};
