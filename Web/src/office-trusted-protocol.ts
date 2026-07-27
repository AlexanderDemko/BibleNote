import { spawnSync } from 'node:child_process';

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

export function isOfficeTrustedProtocol(protocol: string): boolean {
  if (process.platform !== 'win32') return true;
  return officeTrustedProtocolRegistryPaths(protocol).every(registryPath =>
    spawnSync('reg.exe', ['query', registryPath], {
      windowsHide:true,
      stdio:'ignore'
    }).status === 0
  );
}

export function ensureOfficeTrustedProtocol(protocol: string): boolean {
  if (process.platform !== 'win32') return true;
  return officeTrustedProtocolRegistryPaths(protocol).every(registryPath =>
    spawnSync('reg.exe', ['add', registryPath, '/f'], {
      windowsHide:true,
      stdio:'ignore'
    }).status === 0
  );
}
