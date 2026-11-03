import { execFile } from 'node:child_process';

const activationScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BibleNoteForeground {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
}
'@
$deadline = [DateTime]::UtcNow.AddSeconds(5)
do {
  $processes = @(Get-Process -Name ONENOTE -ErrorAction SilentlyContinue)
  if ($processes.Count -gt 0) {
    $handle = [IntPtr]::Zero
    $application = $null
    $windows = $null
    $currentWindow = $null
    try {
      $application = New-Object -ComObject OneNote.Application
      $windows = $application.Windows
      $currentWindow = $windows.CurrentWindow
      if ($null -ne $currentWindow) { $handle = [IntPtr][long]$currentWindow.WindowHandle }
    } catch {
      # Fall back to the main window when OneNote's COM interface is busy.
    } finally {
      foreach ($comObject in @($currentWindow, $windows, $application)) {
        if ($null -ne $comObject -and [Runtime.InteropServices.Marshal]::IsComObject($comObject)) {
          [void][Runtime.InteropServices.Marshal]::ReleaseComObject($comObject)
        }
      }
    }
    if ($handle -eq [IntPtr]::Zero) {
      $process = $processes | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
      if ($null -ne $process) { $handle = $process.MainWindowHandle }
    }
    if ($handle -ne [IntPtr]::Zero) {
      if ([BibleNoteForeground]::IsIconic($handle)) {
        [void][BibleNoteForeground]::ShowWindowAsync($handle, 9)
      }
      [void][BibleNoteForeground]::SetForegroundWindow($handle)
      if ([BibleNoteForeground]::GetForegroundWindow() -eq $handle) {
        Write-Output 'activated'
        exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 150
} while ([DateTime]::UtcNow -lt $deadline)
Write-Output 'not-activated'
`;

// A helper launched by the foreground desktop app can activate OneNote's window.
// Keep this bounded: an activation failure must not undo successful navigation.
export function activateOneNoteWindow(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', activationScript], {
      windowsHide:true, timeout:10_000, encoding:'utf8'
    }, (error, stdout) => resolve(!error && stdout.trim() === 'activated'));
  });
}
