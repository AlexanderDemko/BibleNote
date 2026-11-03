import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const windowsRoot = process.env.WINDIR || 'C:\\Windows';
const msbuild = path.join(windowsRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'MSBuild.exe');
const nativePrerequisites = [
  msbuild,
  path.join(windowsRoot, 'assembly', 'GAC', 'Extensibility', '7.0.3300.0__b03f5f7f11d50a3a', 'Extensibility.dll'),
  path.join(windowsRoot, 'assembly', 'GAC_MSIL', 'office', '15.0.0.0__71e9bce111e9429c', 'office.dll')
];

// Check the UI returned by the compiled COM add-in, rather than its C# source spelling.
test('new OneNote ribbons distinguish BibleNote 4 and identify where commands work', {
  skip:process.platform !== 'win32' || nativePrerequisites.some(file => !fs.existsSync(file)), timeout:60_000
}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-ribbon-ui-'));
  try {
    for (const generation of ['2010', '2013', '2016']) {
      const build = spawnSync(msbuild, [
        path.join(webRoot, 'windows', 'OneNoteRibbon', 'RibbonAddIn', 'RibbonAddIn.csproj'),
        '/t:Build', '/p:Configuration=Release', `/p:OfficeGeneration=${generation}`,
        `/p:OutputPath=${path.join(directory, `Office${generation}`)}\\`,
        `/p:IntermediateOutputPath=${path.join(directory, `obj${generation}`)}\\`,
        '/nologo', '/verbosity:minimal'
      ], { encoding:'utf8', windowsHide:true, timeout:20_000 });
      assert.equal(build.status, 0, build.error?.message || build.stdout + build.stderr);
    }
    const scriptPath = path.join(directory, 'inspect-ribbon.ps1');
    fs.writeFileSync(scriptPath, '\uFEFF' + `
param([string]$Root)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$results = @(foreach ($generation in @('2010', '2013', '2016')) {
  $assembly = [Reflection.Assembly]::LoadFrom((Join-Path $Root "Office$generation\\BibleNote.OneNoteRibbon.Office$generation.dll"))
  $instance = [Activator]::CreateInstance($assembly.GetType('BibleNote.OneNoteRibbon.RibbonAddIn'))
  [xml]$xml = $instance.GetCustomUI('OneNote')
  $tab = $xml.customUI.ribbon.tabs.tab
  @{ generation=$generation; tab=[string]$tab.label; group=[string]$tab.group.label;
     buttons=@($tab.group.button | ForEach-Object {
       @{ id=[string]$_.id; label=[string]$_.label; tip=[string]$_.screentip;
          detail=[string]$_.supertip; action=[string]$_.onAction }
     }) }
})
ConvertTo-Json -InputObject $results -Depth 5 -Compress
`, 'utf8');
    const inspected = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath, '-Root', directory], {
      encoding:'utf8', windowsHide:true, timeout:15_000
    });
    assert.equal(inspected.status, 0, inspected.error?.message || inspected.stdout + inspected.stderr);
    const ribbons = JSON.parse(inspected.stdout);
    assert.equal(ribbons.length, 3);
    for (const ribbon of ribbons) {
      assert.equal(ribbon.tab, 'BibleNote 4');
      assert.equal(ribbon.group, 'BibleNote 4');
      assert.deepEqual(ribbon.buttons.map((button: any) => button.id), [
        'BibleNoteOpenBible', 'BibleNoteQuickAnalyze', 'BibleNoteAnalyzeCurrent', 'BibleNoteOpen'
      ]);
      assert.deepEqual(ribbon.buttons.map((button: any) => button.label), [
        'Библия в BibleNote', 'Распознать библейские ссылки', 'Синхронизировать текущую страницу', 'Заметка в BibleNote'
      ]);
      assert.deepEqual(ribbon.buttons.map((button: any) => button.tip), [
        'Открыть Библию в приложении BibleNote 4.',
        'Распознать библейские ссылки на текущей странице OneNote.',
        'Синхронизировать текущую страницу OneNote с приложением BibleNote 4.',
        'Открыть текущую страницу OneNote в приложении BibleNote 4.'
      ]);
      assert.match(ribbon.buttons[1].detail, /текущей странице OneNote/);
      assert.ok(ribbon.buttons.every((button: any) => button.action === 'OnRibbonAction'));
    }
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
