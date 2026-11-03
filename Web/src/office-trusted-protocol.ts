import { execFile, spawnSync } from 'node:child_process';

const supportedOfficeVersions = ['14.0', '15.0', '16.0'] as const;

export function officeTrustedProtocolRegistryPaths(protocol: string): string[] {
  const normalizedProtocol = normalizedProtocolName(protocol);
  return supportedOfficeVersions.map(version =>
    `HKCU\\Software\\Policies\\Microsoft\\Office\\${version}\\Common\\Security\\Trusted Protocols\\All Applications\\${normalizedProtocol}:`
  );
}

function normalizedProtocolName(protocol: string): string {
  const normalizedProtocol = protocol.trim().replace(/:+$/, '');
  if (!/^[a-z][a-z0-9+.-]*$/i.test(normalizedProtocol)) {
    throw new Error(`Invalid URL protocol name: ${protocol}`);
  }
  return normalizedProtocol;
}

export async function isOfficeTrustedProtocol(protocol: string): Promise<boolean> {
  if (process.platform !== 'win32') return true;
  const results = await Promise.all(officeTrustedProtocolRegistryPaths(protocol).map(registryPath =>
    new Promise<boolean>(resolve => {
      execFile('reg.exe', ['query', registryPath], { windowsHide:true, timeout:5000 }, error => resolve(!error));
    })
  ));
  return results.every(Boolean);
}

type RegistryCommand = (operation: 'query' | 'add', registryPath: string) => boolean;

function runRegistryCommand(operation: 'query' | 'add', registryPath: string): boolean {
  return spawnSync('reg.exe', [operation, registryPath, ...(operation === 'add' ? ['/f'] : [])], {
    windowsHide:true,
    stdio:'ignore',
    timeout:5000
  }).status === 0;
}

export function ensureOfficeTrustedProtocol(protocol: string, run: RegistryCommand = runRegistryCommand): boolean {
  if (process.platform !== 'win32') return true;
  return officeTrustedProtocolRegistryPaths(protocol).every(registryPath =>
    // Existing policies may be readable but protected against changes.
    run('query', registryPath) || run('add', registryPath)
  );
}
