import { existsSync, readFileSync } from 'node:fs';
/**
 * HTTPS 静态开发服务器 —— 用于局域网内调试陀螺仪等需要安全上下文的功能。
 *
 * 使用前需先运行: pnpm gen-cert
 * 运行: pnpm demo:https
 */
import { createServer } from 'node:https';
import os from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certPath = resolve(__dirname, 'localhost.pem');
const keyPath = resolve(__dirname, 'localhost-key.pem');
const demoDir = resolve(__dirname, '..', 'demo');

if (!existsSync(certPath) || !existsSync(keyPath)) {
  console.error('❌ 证书文件不存在，请先运行: pnpm gen-cert');
  process.exit(1);
}

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 4443;

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getMimeType(path) {
  const ext = extname(path).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

const server = createServer(
  {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  },
  (req, res) => {
    let urlPath = req.url?.split('?')[0] || '/';
    if (urlPath === '/') urlPath = '/index.html';

    if (urlPath.includes('..')) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const filePath = join(demoDir, urlPath);

    try {
      const data = readFileSync(filePath);
      const contentType = getMimeType(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    } catch {
      try {
        const data = readFileSync(join(demoDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end(`Not Found: ${urlPath}`);
      }
    }
  },
);

server.listen(PORT, () => {
  const ips = getLocalIP();
  console.log('\n🔒 HTTPS 开发服务器已启动\n');
  console.log(`  本机: https://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`  局域网: https://${ip}:${PORT}`);
  }
  console.log('\n📱 手机浏览器访问上述地址（需先信任自签名证书）');
  console.log('   按 Ctrl+C 停止\n');
});
