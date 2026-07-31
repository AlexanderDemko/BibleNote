export const allAreas = [
  'smoke',
  'notes',
  'search',
  'bible',
  'inductive',
  'sync',
  'settings',
  'electron'
];

export const ignoredChanges = [
  /^(?:README\.md|Web\/README\.md|Api\/README\.md)$/,
  /\.(?:md|txt)$/,
  /^\.github\/ISSUE_TEMPLATE\//
];

export const sharedChanges = [
  /^Web\/ui\/(?:index\.html|bootstrap\.js|layout\.js|styles\.css)$/,
  /^Web\/src\/(?:cache-ui|cache-ui-assets|cache|cache-schema|cache-sql|cache-types|paths)\.ts$/,
  /^Web\/(?:package(?:-lock)?\.json|playwright\.config\.ts)$/,
  /^Web\/e2e\/(?:fixtures|pages)\//,
  /^Web\/e2e\/areas\.mjs$/,
  /^Web\/scripts\/e2e-changed\.mjs$/
];

export const areaChanges = {
  notes: [
    /^Web\/ui\/(?:tree-pages|api-page-view|notebooks-log)\.js$/,
    /^Web\/src\/(?:html|image-proxy|page-access|page-hierarchy|onenote-page-link)\.ts$/
  ],
  search: [
    /^Web\/ui\/navigation-search\.js$/,
    /^Web\/ui\/tree-pages\.js$/,
    /^Web\/src\/(?:cache-search|cache-verse-id)\.ts$/
  ],
  bible: [
    /^Web\/ui\/(?:bible-reader|bible-references)\.js$/,
    /^Web\/src\/(?:bible|biblenote-gateway)\.ts$/,
    /^Api\/(?:Application\/Controllers\/VerseParsing|Services\/VerseParsing|Services\/ModulesManager)\//,
    /^Api\/Application\/Controllers\/VerseParsingController\.cs$/
  ],
  inductive: [
    /^Web\/ui\/bible-reader\.js$/,
    /^Web\/src\/inductive-markings\.ts$/,
    /^Web\/tests\/inductive-markings\.test\.ts$/
  ],
  sync: [
    /^Web\/ui\/sync\.js$/,
    /^Web\/src\/(?:sync|graph|auth|content-priority|onenote-settings)\.ts$/
  ],
  settings: [
    /^Web\/ui\/settings\.js$/,
    /^Web\/src\/(?:env|runtime-logging|office-trusted-protocol)\.ts$/
  ],
  electron: [
    /^Web\/src\/(?:electron-main|loopback-server)\.ts$/,
    /^Web\/windows\//,
    /^Web\/scripts\/(?:stage-|package-|bump-version)/,
    /^Web\/electron-builder\./
  ]
};

export function areasForChangedFiles(files) {
  const relevant = files.filter(file => !ignoredChanges.some(pattern => pattern.test(file)));
  if (relevant.length === 0) return ['smoke'];
  if (relevant.some(file => sharedChanges.some(pattern => pattern.test(file)))) return allAreas;

  const selected = new Set(['smoke']);
  for (const file of relevant) {
    let matched = false;
    for (const [area, patterns] of Object.entries(areaChanges)) {
      if (patterns.some(pattern => pattern.test(file))) {
        selected.add(area);
        matched = true;
      }
    }
    if (/^Web\/e2e\/specs\/([^/]+)\//.test(file)) {
      const area = file.match(/^Web\/e2e\/specs\/([^/]+)\//)?.[1];
      if (area && allAreas.includes(area)) selected.add(area);
      matched = true;
    }
    if (!matched) return allAreas;
  }
  return allAreas.filter(area => selected.has(area));
}
