import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/client.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

const body = result.outputFiles[0].text;
const wrapped = `window.__ModuleLoader__.load({
  id: "your-turn-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  }
});
`;

await mkdir('lib', { recursive: true });
await writeFile('lib/client.js', wrapped, 'utf8');
console.log('built lib/client.js');
