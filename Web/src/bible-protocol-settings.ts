import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { legacyHandlerFromCommand } from './legacy-bible.js';

export const bibleLinkProtocols = ['bnverse', 'isbtbibleverse'] as const;
type ProtocolCommands = Partial<Record<typeof bibleLinkProtocols[number], string>>;

export type BibleProtocolDependencies = {
  registered: () => boolean;
  register: () => boolean;
  notifyChanged: () => Promise<void>;
  readCommands: () => Promise<ProtocolCommands>;
  writeCommands: (commands: ProtocolCommands) => Promise<void>;
  loadPrevious: () => ProtocolCommands;
  savePrevious: (commands: ProtocolCommands) => void;
  findLegacy: () => Promise<string | undefined>;
  exists: (executable: string) => boolean;
  legacyBridgeCommand: () => string;
};

// The Windows registrations persist the choice; startup must only read them.
export class BibleProtocolSettings {
  constructor(private readonly dependencies: BibleProtocolDependencies) {}

  async setEnabled(enabled: boolean): Promise<void> {
    const dependencies = this.dependencies;
    const current = await dependencies.readCommands();
    const previous = dependencies.loadPrevious();
    if (enabled) {
      for (const protocol of bibleLinkProtocols) {
        const command = current[protocol];
        const executable = command && legacyHandlerFromCommand(command);
        if (executable && dependencies.exists(executable)) previous[protocol] = command;
      }
      dependencies.savePrevious(previous);
      try {
        if (!dependencies.register()) {
          throw new Error('Windows не подтвердила настройку открытия ссылок в BibleNote 4.');
        }
        await dependencies.notifyChanged();
        if (!dependencies.registered()) {
          throw new Error('Windows не подтвердила настройку открытия ссылок в BibleNote 4.');
        }
      } catch (error) {
        await dependencies.writeCommands(current);
        throw error;
      }
      return;
    }

    const legacy = await dependencies.findLegacy();
    const command = previous.isbtbibleverse;
    const executable = command && legacyHandlerFromCommand(command);
    const restored: ProtocolCommands = {
      // v3 cannot parse bnVerse; v4 converts these links before forwarding them.
      bnverse:dependencies.legacyBridgeCommand(),
      isbtbibleverse:executable && dependencies.exists(executable) ? command
        : legacy ? `"${legacy}" "%1"` : undefined
    };
    if (bibleLinkProtocols.some(protocol => !restored[protocol])) {
      throw new Error('Старый BibleNote не найден. Установите его, чтобы вернуть открытие библейских ссылок.');
    }
    try {
      await dependencies.writeCommands(restored);
      const actual = await dependencies.readCommands();
      if (bibleLinkProtocols.some(protocol => actual[protocol] !== restored[protocol]) || dependencies.registered()) {
        throw new Error('Windows не подтвердила открытие ссылок в старом BibleNote.');
      }
    } catch (error) {
      await dependencies.writeCommands(current);
      throw error;
    }
  }
}

function runRegistryScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(`$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)\n${script}`, 'utf16le').toString('base64')],
    { windowsHide:true, timeout:10_000, encoding:'utf8' }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

export async function readBibleProtocolCommands(): Promise<ProtocolCommands> {
  const output = await runRegistryScript(`
    $commands = @{}
    foreach ($protocol in @('bnverse', 'isbtbibleverse')) {
      $key = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey($protocol + '\\shell\\open\\command')
      if ($null -ne $key) {
        try { $commands[$protocol] = $key.GetValue('') } finally { $key.Dispose() }
      }
    }
    ConvertTo-Json -InputObject $commands -Compress
  `);
  return JSON.parse(output) as ProtocolCommands;
}

const associationChangeScript = `
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BibleNoteAssociationChange {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
}
'@
  [BibleNoteAssociationChange]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
`;

export async function notifyBibleProtocolAssociationsChanged(): Promise<void> {
  await runRegistryScript(associationChangeScript);
}

export async function writeBibleProtocolCommands(commands: ProtocolCommands): Promise<void> {
  const payload = Buffer.from(JSON.stringify(commands), 'utf8').toString('base64');
  await runRegistryScript(`
    $commands = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
    foreach ($protocol in @('bnverse', 'isbtbibleverse')) {
      $command = $commands.$protocol
      if (-not $command) { continue }
      $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\\Classes\\' + $protocol)
      try { $key.SetValue('URL Protocol', '') } finally { $key.Dispose() }
      $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\\Classes\\' + $protocol + '\\shell\\open\\command')
      try { $key.SetValue('', [string]$command) } finally { $key.Dispose() }
    }
    ${associationChangeScript}
  `);
}

export function loadPreviousBibleProtocolCommands(file: string): ProtocolCommands {
  if (!fs.existsSync(file)) return {};
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: ProtocolCommands = {};
  for (const protocol of bibleLinkProtocols) {
    const command = (value as Record<string, unknown>)[protocol];
    if (typeof command === 'string') result[protocol] = command;
  }
  return result;
}
