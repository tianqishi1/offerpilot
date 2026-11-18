import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'extension', 'demo');
const port = Number(process.env.DEMO_PORT ?? 5173);
createServer((req, res) => {
  try {
    const path = req.url === '/' ? '/demo.html' : (req.url ?? '/demo.html');
    const html = readFileSync(join(root, path));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`[demo] http://127.0.0.1:${port}/`));
