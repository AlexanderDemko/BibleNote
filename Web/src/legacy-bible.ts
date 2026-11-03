import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { activateOneNoteWindow } from './onenote-foreground.js';

// These registrations survive when the new app takes over isbtBibleVerse.
const legacyProtocols = ['isbtBibleVerse', 'isbtNotesPage', 'isbtOpen', 'isbtStrongOpen'];

const legacyBookNames = [
  'Быт', 'Исх', 'Лев', 'Чис', 'Втор', 'Нав', 'Суд', 'Руф', '1Цар', '2Цар', '3Цар', '4Цар',
  '1Пар', '2Пар', 'Ездр', 'Неем', 'Есф', 'Иов', 'Пс', 'Притч', 'Еккл', 'Песн', 'Ис', 'Иер',
  'Плач', 'Иез', 'Дан', 'Ос', 'Иоил', 'Ам', 'Авд', 'Ион', 'Мих', 'Наум', 'Авв', 'Соф', 'Агг',
  'Зах', 'Мал', 'Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Иак', '1Пет', '2Пет', '1Ин', '2Ин', '3Ин',
  'Иуд', 'Рим', '1Кор', '2Кор', 'Гал', 'Еф', 'Флп', 'Кол', '1Фес', '2Фес', '1Тим', '2Тим',
  'Тит', 'Флм', 'Евр', 'Откр'
];

export function legacyBibleLinkFromExternal(rawLink: string): string {
  if (/^isbtBibleVerse:/i.test(rawLink)) return rawLink;
  if (!/^bnVerse:/i.test(rawLink)) throw new Error('A Bible link is required.');
  const payload = rawLink.replace(/^bnVerse:/i, '');
  let decoded: string;
  try { decoded = decodeURIComponent(payload); } catch { decoded = payload; }
  const [machine, display] = decoded.split(';', 2);
  const coordinates = machine.trim().match(/^(?:[^/]+\/|\/+)(\d+)\s+(\d+(?::\d+)?(?:-(?:\d+:)?\d+)?)$/);
  const book = coordinates && legacyBookNames[Number(coordinates[1]) - 1];
  const reference = display?.trim() || (coordinates ? book && `${book} ${coordinates[2]}` : machine.trim());
  if (!reference || /[;&\r\n\x00]/.test(reference)) throw new Error('Ссылка не содержит понятного старому BibleNote библейского адреса.');
  return `isbtBibleVerse:/;${encodeURIComponent(reference)}`;
}

export function legacyHandlerFromCommand(command: string): string | undefined {
  const match = command.trim().match(/^(?:"([^"]+)"|(\S+))/);
  const executable = match?.[1] || match?.[2];
  return executable && path.win32.isAbsolute(executable)
    && path.win32.basename(executable).toLowerCase() === 'isbtcommandhandler.exe'
    ? executable : undefined;
}

function readLegacyProtocolCommands(): Promise<string[]> {
  const script = `
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $commands = @(
      foreach ($view in @('Registry64', 'Registry32')) {
        $root = [Microsoft.Win32.RegistryKey]::OpenBaseKey('ClassesRoot', [Microsoft.Win32.RegistryView]$view)
        try {
          foreach ($protocol in @(${legacyProtocols.map(protocol => `'${protocol}'`).join(',')})) {
            $key = $root.OpenSubKey($protocol + '\\shell\\open\\command')
            if ($null -ne $key) {
              try { $key.GetValue('') } finally { $key.Dispose() }
            }
          }
        } finally { $root.Dispose() }
      }
    )
    ConvertTo-Json -InputObject @($commands) -Compress
  `;
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide:true, timeout:5000, encoding:'utf8' }, (error, stdout) => {
        try {
          const commands: unknown = error ? [] : JSON.parse(stdout.trim());
          resolve(Array.isArray(commands) ? commands.filter((command): command is string => typeof command === 'string') : []);
        } catch { resolve([]); }
      });
  });
}

export async function findLegacyBibleHandler(): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined;
  const commands = await readLegacyProtocolCommands();
  for (const command of commands) {
    const executable = legacyHandlerFromCommand(command);
    try {
      if (executable && fs.statSync(executable).isFile()) return executable;
    } catch {
      // Ignore stale registrations left behind by an uninstalled v3.
    }
  }
  return undefined;
}

export function legacyBibleChapterLink(ref: unknown): string {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw new Error('A Bible chapter is required.');
  const { bookIndex, chapter, bookName } = ref as Record<string, unknown>;
  if (!Number.isSafeInteger(bookIndex) || Number(bookIndex) < 1 || Number(bookIndex) > 100
    || !Number.isSafeInteger(chapter) || Number(chapter) < 1 || Number(chapter) > 200
    || typeof bookName !== 'string' || !bookName.trim() || bookName.length > 200
    || /[;:&\r\n\x00]/.test(bookName)) {
    throw new Error('A valid Bible book and chapter are required.');
  }
  // v3 parses the display part using its own configured Bible module.
  return `isbtBibleVerse:/${bookIndex} ${chapter};${encodeURIComponent(`${bookName.trim()} ${chapter}`)}`;
}

export function legacyBibleVerseLink(ref: unknown): string {
  legacyBibleChapterLink(ref);
  const { bookIndex, chapter, bookName, verse = 1 } = ref as Record<string, unknown>;
  if (!Number.isSafeInteger(verse) || Number(verse) < 1 || Number(verse) > 1000) {
    throw new Error('A valid first Bible verse is required.');
  }
  return `isbtBibleVerse:/${bookIndex} ${chapter}:${verse};${encodeURIComponent(`${String(bookName).trim()} ${chapter}:${verse}`)}`;
}

export async function openLegacyBibleChapter(
  executable: string, link: string, activateWindow: () => Promise<boolean> = activateOneNoteWindow
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [link], {
      cwd:path.win32.dirname(executable), detached:true, stdio:'ignore', windowsHide:true
    });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  await activateWindow().catch(() => false);
}
