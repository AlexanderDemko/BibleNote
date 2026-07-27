const fs = require('node:fs');
const path = require('node:path');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const base = packageJson.build;

module.exports = {
  ...base,
  extraResources: [
    {
      from: 'vendor/BibleNote/osx-arm64',
      to: 'BibleNote',
      filter: ['**/*']
    }
  ],
  afterPack: async context => {
    if (context.electronPlatformName !== 'darwin') return;

    const appBundle = path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`
    );
    const resources = path.join(appBundle, 'Contents', 'Resources');
    const nativeSource = path.join(
      __dirname,
      'vendor',
      'native',
      'darwin-arm64',
      'better_sqlite3.node'
    );
    const nativeTarget = path.join(
      resources,
      'app',
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node'
    );

    fs.mkdirSync(path.dirname(nativeTarget), { recursive: true });
    fs.copyFileSync(nativeSource, nativeTarget);

    // These are native Mach-O files. Marking them executable is required when
    // this hook runs on macOS and harmless during an unsigned cross-build.
    fs.chmodSync(nativeTarget, 0o755);
    fs.chmodSync(path.join(resources, 'BibleNote', 'BibleNote.Application'), 0o755);
  },
  mac: {
    icon: 'assets/biblenote-icon.png',
    category: 'public.app-category.reference',
    identity: null,
    target: [
      {
        target: 'zip',
        arch: ['arm64']
      }
    ],
    artifactName: '${productName}-${version}-mac-${arch}.${ext}'
  }
};
