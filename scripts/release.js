#!/usr/bin/env node
/**
 * 一键发布脚本：自动累加版本号 → 构建 → 发布到 npm。
 *
 * 用法:
 *   pnpm release:patch   # 0.1.0 → 0.1.1
 *   pnpm release:minor   # 0.1.0 → 0.2.0
 *   pnpm release:major   # 0.1.0 → 1.0.0
 *   pnpm release         # 默认 patch
 *
 * 容错能力:
 *   - 自动以本地 + 远程最新 tag 为基准累加，避免 package.json 落后导致冲突
 *   - 目标版本若已存在（本地或远程 tag），自动递增 patch 直到可用
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

function exec(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function parseVer(v) {
  return v.replace(/^v/, '').split('.').map(Number);
}

function compareVer(a, b) {
  const pa = parseVer(a);
  const pb = parseVer(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function bump(version, t) {
  const [major, minor, patch] = parseVer(version);
  if (t === 'major') return `${major + 1}.0.0`;
  if (t === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** 同时检查本地和远程 tag 是否存在 */
function tagExists(version) {
  const tagName = `v${version}`;
  try {
    execSync(`git rev-parse "${tagName}"`, { stdio: 'ignore' });
    return true;
  } catch {}
  try {
    const out = execSync(`git ls-remote --tags origin "refs/tags/${tagName}"`, {
      encoding: 'utf-8',
    }).trim();
    if (out) return true;
  } catch {}
  return false;
}

/** 收集本地 + 远程所有版本 tag */
function getAllTags() {
  const local = exec('git tag --list "v*"')
    .split('\n')
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  let remote = [];
  try {
    remote = exec('git ls-remote --tags origin "v*"')
      .split('\n')
      .map((line) => line.replace(/.*refs\/tags\//, '').replace(/\^\{\}$/, ''))
      .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  } catch {}
  return [...new Set([...local, ...remote])];
}

const pkgPath = new URL('../package.json', import.meta.url);

try {
  // 1. 确保工作区干净（避免误提交无关文件）
  const status = exec('git status --porcelain');
  if (status) {
    console.error('❌ 工作区有未提交的改动，请先 commit 或 stash 再发布:');
    console.error(status);
    process.exit(1);
  }

  // 2. 以本地 + 远程最高 tag 为基准，避免 package.json 落后
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  let currentVersion = pkg.version;

  const tags = getAllTags();
  if (tags.length > 0) {
    tags.sort(compareVer);
    const latestVersion = tags[tags.length - 1].replace(/^v/, '');
    if (compareVer(latestVersion, currentVersion) > 0) {
      console.warn(
        `⚠️  package.json (${currentVersion}) 落后于最新 tag (v${latestVersion})，以 tag 为基准继续累加`,
      );
      currentVersion = latestVersion;
    }
  }

  // 3. 计算目标版本，跳过已存在的 tag（本地或远程）
  let targetVersion = bump(currentVersion, type);
  while (tagExists(targetVersion)) {
    console.warn(`⚠️  v${targetVersion} 已存在（本地或远程），继续递增 patch`);
    targetVersion = bump(targetVersion, 'patch');
  }

  // 4. bump 版本号（自动创建 git commit + tag）
  run(`pnpm version ${targetVersion}`, `累加版本号至 v${targetVersion}`);

  // 5. 构建
  run('pnpm build', '构建产物');

  // 6. 发布
  run('pnpm publish --no-git-checks', '发布到 npm');

  // 7. 推送 commit + tag
  run('git push --follow-tags', '推送 commit 与 tag 到远程');

  console.log('\n✅ 发布完成！');
} catch (e) {
  console.error('\n❌ 发布失败:', e.message);
  process.exit(1);
}
