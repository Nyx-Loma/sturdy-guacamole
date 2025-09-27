import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['**/*.test.ts', '**/__tests__/**/*.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'prefer-const': 'off'
    }
  }
);

