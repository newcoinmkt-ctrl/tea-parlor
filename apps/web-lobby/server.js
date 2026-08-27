import { createReadStream, existsSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('.', import.meta.url));
const monorepoRoot = resolve(root, '../..');
const packagesRoot = resolve(monorepoRoot, 'packages');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';

/**
 * 显式覆盖（可选）。未列出的包也会在请求时从 packages/<name>/src 解析，
 * 避免 H5 新增 /vendor/<pkg> 后因旧 allowlist 404 导致整站脚本加载失败。
 */
const VENDOR_ENGINES = Object.freeze({
  'doudizhu-engine': resolve(packagesRoot, 'doudizhu-engine/src'),
  'guandan-engine': resolve(packagesRoot, 'guandan-engine/src'),
  'texas-engine': resolve(packagesRoot, 'texas-engine/src'),
  'zhajinhua-engine': resolve(packagesRoot, 'zhajinhua-engine/src'),
  'mahjong-engine': resolve(packagesRoot, 'mahjong-engine/src'),
  'avatar-system': resolve(packagesRoot, 'avatar-system/src'),
  'character-catalog': resolve(packagesRoot, 'character-catalog/src'),
});

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function containedIn(dir, filePath) {
  const rel = relative(dir, filePath);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

function vendorSrcDir(pkg) {
  if (!/^[a-z0-9-]+$/i.test(pkg)) return null;
  const mapped = VENDOR_ENGINES[pkg];
  if (mapped && existsSync(mapped)) return mapped;
  const discovered = resolve(packagesRoot, pkg, 'src');
  if (existsSync(discovered)) return discovered;
  return null;
}

export function resolvePublicPath(pathname) {
  const vendorMatch = pathname.match(/^\/vendor\/([a-z0-9-]+)\/(.*)$/i);
  if (vendorMatch) {
    const pkg = vendorMatch[1];
    const rel = vendorMatch[2];
    const base = vendorSrcDir(pkg);
    if (!base) return null;
    const filePath = normalize(join(base, rel));
    if (!containedIn(base, filePath)) return null;
    return filePath;
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(root, requested));
  if (!containedIn(root, filePath) && filePath !== normalize(join(root, 'index.html'))) return null;
  return filePath;
}

export function createWebLobbyServer() {
  return createServer((req, res) => {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
    const filePath = resolvePublicPath(pathname);

    if (!filePath || !existsSync(filePath)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': types[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    createReadStream(filePath).pipe(res);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createWebLobbyServer().listen(port, host, () => {
    console.log(`web-lobby listening on http://${host}:${port}`);
  });
}
