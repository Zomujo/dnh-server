import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		root: './',
		environment: 'node',
		// Same zone the server pins in src/set-time-zone.ts.
		env: { TZ: 'Africa/Accra' },
		include: ['test/**/*.e2e-spec.ts'],
	},
	resolve: {
		alias: { '@': resolve(__dirname, '../src') },
	},
	oxc: false,
	plugins: [
		swc.vite({
			module: { type: 'es6' },
		}),
	],
});
