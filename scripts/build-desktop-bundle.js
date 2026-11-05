const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { spawn } = require('child_process');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const real = fs.realpathSync(s);
      if (fs.statSync(real).isDirectory()) copyDir(real, d);
      else fs.copyFileSync(real, d);
    } else if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const serverResDir = path.join(root, 'src-tauri', 'resources', 'server');
  const binResDir = path.join(root, 'src-tauri', 'resources', 'bin');

  console.log('1. Preparing destination directories...');
  fs.rmSync(serverResDir, { recursive: true, force: true });
  fs.mkdirSync(serverResDir, { recursive: true });
  fs.mkdirSync(binResDir, { recursive: true });

  console.log('2. Bundling Fastify server with esbuild...');
  esbuild.buildSync({
    entryPoints: [path.join(root, 'apps', 'server', 'src', 'index.ts')],
    bundle: true,
    minify: true,
    platform: 'node',
    target: 'node22',
    outfile: path.join(serverResDir, 'server.cjs'),
    format: 'cjs',
    external: ['better-sqlite3', '@napi-rs/keyring'],
    sourcemap: false,
  });

  console.log('3. Staging better-sqlite3 native addon...');
  const betterSqliteSrc = path.join(root, 'apps', 'server', 'node_modules', 'better-sqlite3');
  const betterSqliteDest = path.join(serverResDir, 'node_modules', 'better-sqlite3');
  fs.mkdirSync(path.join(betterSqliteDest, 'prebuilds'), { recursive: true });
  copyDir(path.join(betterSqliteSrc, 'lib'), path.join(betterSqliteDest, 'lib'));
  fs.copyFileSync(path.join(betterSqliteSrc, 'package.json'), path.join(betterSqliteDest, 'package.json'));
  fs.copyFileSync(
    path.join(betterSqliteSrc, 'prebuilds', 'win32-x64.node'),
    path.join(betterSqliteDest, 'prebuilds', 'win32-x64.node'),
  );

  console.log('4. Staging @napi-rs/keyring native addon...');
  const keyringSrc = path.join(root, 'apps', 'server', 'node_modules', '@napi-rs', 'keyring');
  const keyringDest = path.join(serverResDir, 'node_modules', '@napi-rs', 'keyring');
  fs.mkdirSync(keyringDest, { recursive: true });
  fs.copyFileSync(path.join(keyringSrc, 'index.js'), path.join(keyringDest, 'index.js'));
  fs.copyFileSync(path.join(keyringSrc, 'package.json'), path.join(keyringDest, 'package.json'));

  // Find keyring.win32-x64-msvc.node in .pnpm
  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  const pnpmKeyring = fs
    .readdirSync(pnpmDir)
    .find((d) => d.startsWith('@napi-rs+keyring-win32-x64-msvc@'));
  if (!pnpmKeyring) throw new Error('Cannot locate @napi-rs/keyring-win32-x64-msvc in .pnpm');

  const keyringNodeBinary = path.join(
    pnpmDir,
    pnpmKeyring,
    'node_modules',
    '@napi-rs',
    'keyring-win32-x64-msvc',
    'keyring.win32-x64-msvc.node',
  );
  fs.copyFileSync(keyringNodeBinary, path.join(keyringDest, 'keyring.win32-x64-msvc.node'));

  console.log('5. Staging node.exe runtime...');
  const systemNode = 'C:\\Program Files\\nodejs\\node.exe';
  const destNode = path.join(binResDir, 'node.exe');
  if (!fs.existsSync(destNode)) {
    console.log(`Copying ${systemNode} to ${destNode}...`);
    fs.copyFileSync(systemNode, destNode);
  }

  console.log('✓ Desktop bundle successfully staged!');
}

main().catch((err) => {
  console.error('Fatal bundling error:', err);
  process.exit(1);
});
