import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint 9+ flat config.
 * Prettier: solo formato (.prettierrc). eslint-config-prettier va al final y desactiva
 * reglas de ESLint que chocan con el formateo de Prettier.
 */
export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'build/**',
			'coverage/**',
			// Claude Code worktrees are full copies of the repo; linting them
			// double-reports every file and can explode into thousands of errors.
			'.claude/worktrees/**',
			// Agent scratch working dirs; gitignored, never shipped, and linting
			// them turns tool output into red build gates.
			'.work/**'
		]
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		// Node-side code: build scripts and the API server. Browser globals
		// don't apply here, and `process` / `console` are legitimate.
		files: ['scripts/**/*.mjs', 'backend/server/**/*.mjs'],
		languageOptions: {
			ecmaVersion: 2022,
			globals: globals.node,
			sourceType: 'module'
		}
	},
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parserOptions: {
				ecmaFeatures: { jsx: true }
			}
		},
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'react-refresh/only-export-components': [
				'warn',
				{ allowConstantExport: true }
			]
		}
	},
	eslintConfigPrettier
);
