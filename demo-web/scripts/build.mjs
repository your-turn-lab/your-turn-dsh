import { build, context } from 'esbuild';
import { mkdir, copyFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await cp('public', 'dist', { recursive: true });
const options = {
  entryPoints: ['src/app.jsx'], bundle: true, outdir: 'dist',
  format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true, metafile: true, logLevel: 'info',
};
if (process.argv.includes('--serve')) {
  const ctx = await context(options);
  await ctx.watch();
  const server = await ctx.serve({ servedir: 'dist', host: '127.0.0.1', port: Number(process.env.PORT || 4173) });
  console.log(`Your Turn Demo: http://127.0.0.1:${server.port}`);
} else {
  const result = await build(options);
  const unsafe = Object.keys(result.metafile.inputs).filter((p) => /@deepseek-ai|\.\.\//.test(p));
  if (unsafe.length) throw new Error(`Demo must remain independent: ${unsafe.join(', ')}`);
  await mkdir('verification', { recursive: true });
  await writeFile('verification/build-inputs.json', JSON.stringify(Object.keys(result.metafile.inputs), null, 2));
}
