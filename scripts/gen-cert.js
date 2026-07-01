/**
 * 生成本地开发用自签名 SSL 证书（依赖 selfsigned 5.x）。
 *
 * 运行: pnpm gen-cert
 * 输出: scripts/localhost.pem + scripts/localhost-key.pem
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certPath = resolve(__dirname, 'localhost.pem');
const keyPath = resolve(__dirname, 'localhost-key.pem');

console.log('正在生成 RSA-2048 自签名证书...');

const attrs = [{ name: 'commonName', value: 'VR Player Dev' }];
const pems = await selfsigned.generate(attrs, {
  keySize: 2048,
  algorithm: 'sha256',
  days: 365,
});

writeFileSync(certPath, `${pems.cert}\n`, 'utf-8');
writeFileSync(keyPath, `${pems.private}\n`, 'utf-8');

console.log('\n✅ 证书已生成:');
console.log(`   ${certPath}`);
console.log(`   ${keyPath}`);
console.log('\n运行 pnpm demo:https 启动 HTTPS 开发服务器');
console.log('手机首次访问需在浏览器中信任该证书\n');
