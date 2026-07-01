#!/usr/bin/env node
/**
 * 一键发布脚本：自动累加版本号 → 构建 → 发布到 npm。
 *
 * 用法:
 *   pnpm release:patch   # 0.1.0 → 0.1.1
 *   pnpm release:minor   # 0.1.0 → 0.2.0
 *   pnpm release:major   # 0.1.0 → 1.0.0
 *   pnpm release         # 默认 patch
 */
import { execSync } from 'node:child_process';

const type = process.argv[2] || 'patch';
const validTypes = ['patch', 'minor', 'major'];
if (!validTypes.includes(type)) {
  console.error(`❌ 无效的版本类型: ${type}，可选: ${validTypes.join(', ')}`);
  process.exit(1);
}

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  // 1. 确保工作区干净（避免误提交无关文件）
  const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
  if (status) {
    console.error('❌ 工作区有未提交的改动，请先 commit 或 stash 再发布:');
    console.error(status);
    process.exit(1);
  }

  // 2. bump 版本号（自动创建 git commit + tag）
  run(`pnpm version ${type}`, `累加 ${type} 版本号`);

  // 3. 构建
  run('pnpm build', '构建产物');

  // 4. 发布
  run('pnpm publish --no-git-checks', '发布到 npm');

  // 5. 推送 commit + tag
  run('git push --follow-tags', '推送 commit 与 tag 到远程');

  console.log('\n✅ 发布完成！');
} catch (e) {
  console.error('\n❌ 发布失败:', e.message);
  process.exit(1);
}
