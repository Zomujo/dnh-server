import { resolve } from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src'),
		},
	},
	oxc: false,
	test: {
		globals: true,
		root: './',
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		typecheck: { tsconfig: './tsconfig.test.json' },
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/**/*.module.ts', 'src/main.ts'],
		},
	},
	plugins: [
		swc.vite({
			module: { type: 'es6' },
		}),
	],
});
