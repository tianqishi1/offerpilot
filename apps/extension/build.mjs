import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const common = { bundle: true, target: 'chrome120', sourcemap: true, logLevel: 'info' };
await build({ ...common, entryPoints: ['src/background.ts'], outfile: 'dist/background.js', format: 'esm', platform: 'browser' });
await build({ ...common, entryPoints: ['src/content.ts'], outfile: 'dist/content.js', format: 'iife', platform: 'browser' });
await build({ ...common, entryPoints: ['src/sidepanel/main.ts'], outfile: 'dist/sidepanel.js', format: 'iife', platform: 'browser' });
cpSync('public', 'dist', { recursive: true });
console.log('extension built -> dist/');
