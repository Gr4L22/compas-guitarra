import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(new URL('../index.html', import.meta.url), new URL('index.html', output));
await cp(new URL('../src/', import.meta.url), new URL('src/', output), { recursive: true });
await copyFile(new URL('../.nojekyll', import.meta.url), new URL('.nojekyll', output));
console.log('Sitio generado en dist/');
