import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { folderSourceExtensions, pdfExtractionVersion } from './folder-extract.js';

export type FolderNotebook = {
  id: string;
  displayName: string;
  lastModifiedDateTime?: string;
  links: { folderPath: string };
};

export type FolderSectionGroup = {
  id: string;
  displayName: string;
  parentNotebook: { id: string; displayName: string };
  parentSectionGroup?: { id: string; displayName: string };
  sectionGroupPath: string;
  orderIndex: number;
  lastModifiedDateTime?: string;
};

export type FolderSection = {
  id: string;
  displayName: string;
  parentNotebook: { id: string; displayName: string };
  parentSectionGroup?: { id: string; displayName: string };
  sectionGroupPath?: string;
  sectionGroupInfoKnown: true;
  orderIndex: number;
  lastModifiedDateTime?: string;
  links: { folderPath: string };
};

export type FolderPage = {
  id: string;
  title: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  contentUrl: string;
  parentSection: { id: string; displayName: string };
  parentNotebook: { id: string; displayName: string };
  orderIndex: number;
  level: number;
  cachedExtractionVersion?: number;
  links: {
    folder: {
      path: string;
      relativePath: string;
      extension: string;
      extractionVersion?: number;
      quality?: string;
      qualityMessage?: string;
      warnings?: string[];
    };
  };
};

export type FolderSnapshot = {
  notebooks: FolderNotebook[];
  sectionGroups: FolderSectionGroup[];
  sections: FolderSection[];
  pages: FolderPage[];
  scanErrors: Array<{ path: string; error: string }>;
};

export type FolderSnapshotOptions = {
  deduplicateFilesByName?: boolean;
};

const folderFileExtensionPriority = new Map([
  ['.docx', 0],
  ['.doc', 1],
  ['.html', 2],
  ['.htm', 3],
  ['.txt', 4],
  ['.pdf', 5]
]);

function preferredFilesByName<T extends { name: string }>(entries: readonly T[]): T[] {
  const selected = new Map<string, { entry: T; priority: number; index: number }>();
  entries.forEach((entry, index) => {
    const extension = path.extname(entry.name).toLowerCase();
    const key = path.basename(entry.name, extension).normalize('NFC').toLocaleLowerCase();
    const priority = folderFileExtensionPriority.get(extension) ?? Number.MAX_SAFE_INTEGER;
    const current = selected.get(key);
    if (!current || priority < current.priority) selected.set(key, { entry, priority, index });
  });
  return [...selected.values()].sort((left, right) => left.index - right.index).map(item => item.entry);
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function stableId(kind: string, value: string): string {
  const digest = createHash('sha256').update(canonicalPath(value)).digest('hex').slice(0, 32);
  return `folder:${kind}:${digest}`;
}

export function folderNotebookId(folderPath: string): string {
  return stableId('notebook', folderPath);
}

function folderSectionId(folderPath: string): string {
  return stableId('section', folderPath);
}

function folderGroupId(folderPath: string): string {
  return stableId('group', folderPath);
}

export function folderPageId(filePath: string): string {
  return stableId('page', filePath);
}

function titleFromPath(filePath: string): string {
  const extension = path.extname(filePath);
  return path.basename(filePath, extension) || path.basename(filePath);
}

function displayFolderName(folderPath: string): string {
  return path.basename(folderPath) || folderPath;
}

function isTemporaryOfficeFile(fileName: string): boolean {
  return fileName.startsWith('~$');
}

export async function listFolderNotebooks(folderPaths: readonly string[]): Promise<FolderNotebook[]> {
  const notebooks: FolderNotebook[] = [];
  for (const configuredPath of folderPaths) {
    const folderPath = path.resolve(configuredPath);
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) throw new Error(`Folder source is not a directory: ${folderPath}`);
    notebooks.push({
      id:folderNotebookId(folderPath),
      displayName:displayFolderName(folderPath),
      lastModifiedDateTime:stat.mtime.toISOString(),
      links:{ folderPath }
    });
  }
  return notebooks;
}

export async function loadFolderSnapshot(folderPaths: readonly string[], options: FolderSnapshotOptions = {}): Promise<FolderSnapshot> {
  const snapshot: FolderSnapshot = { notebooks:[], sectionGroups:[], sections:[], pages:[], scanErrors:[] };
  const notebooks = await listFolderNotebooks(folderPaths);
  snapshot.notebooks.push(...notebooks);

  for (const notebook of notebooks) {
    const rootPath = notebook.links.folderPath;
    let sectionOrder = 0;
    let groupOrder = 0;

    const visit = async (directoryPath: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(directoryPath, { withFileTypes:true });
      } catch (error) {
        snapshot.scanErrors.push({ path:directoryPath, error:error instanceof Error ? error.message : String(error) });
        return;
      }
      entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric:true, sensitivity:'base' }));
      const relativeDirectory = path.relative(rootPath, directoryPath);
      const directoryName = displayFolderName(directoryPath);
      const notebookRef = { id:notebook.id, displayName:notebook.displayName };
      let group: FolderSectionGroup | undefined;
      if (relativeDirectory) {
        const parentDirectory = path.dirname(directoryPath);
        const parentRelative = path.relative(rootPath, parentDirectory);
        group = {
          id:folderGroupId(directoryPath),
          displayName:directoryName,
          parentNotebook:notebookRef,
          parentSectionGroup:parentRelative
            ? { id:folderGroupId(parentDirectory), displayName:displayFolderName(parentDirectory) }
            : undefined,
          sectionGroupPath:relativeDirectory.split(path.sep).join(' / '),
          orderIndex:groupOrder++,
          lastModifiedDateTime:(await fs.stat(directoryPath)).mtime.toISOString()
        };
        snapshot.sectionGroups.push(group);
      }

      const discoveredFiles = entries.filter(entry => entry.isFile()
        && !isTemporaryOfficeFile(entry.name)
        && folderSourceExtensions.has(path.extname(entry.name).toLowerCase()));
      const supportedFiles = options.deduplicateFilesByName
        ? preferredFilesByName(discoveredFiles)
        : discoveredFiles;
      if (supportedFiles.length > 0) {
        const section: FolderSection = {
          id:folderSectionId(directoryPath),
          displayName:relativeDirectory ? 'Файлы' : directoryName,
          parentNotebook:notebookRef,
          parentSectionGroup:group ? { id:group.id, displayName:group.displayName } : undefined,
          sectionGroupPath:relativeDirectory ? relativeDirectory.split(path.sep).join(' / ') : undefined,
          sectionGroupInfoKnown:true,
          orderIndex:sectionOrder++,
          lastModifiedDateTime:(await fs.stat(directoryPath)).mtime.toISOString(),
          links:{ folderPath:directoryPath }
        };
        snapshot.sections.push(section);
        for (const [orderIndex, entry] of supportedFiles.entries()) {
          const filePath = path.join(directoryPath, entry.name);
          try {
            const stat = await fs.stat(filePath);
            const extension = path.extname(filePath).toLowerCase();
            snapshot.pages.push({
              id:folderPageId(filePath),
              title:titleFromPath(filePath),
              createdDateTime:stat.birthtime.toISOString(),
              lastModifiedDateTime:stat.mtime.toISOString(),
              contentUrl:filePath,
              parentSection:{ id:section.id, displayName:section.displayName },
              parentNotebook:notebookRef,
              orderIndex,
              level:0,
              links:{
                folder:{
                  path:filePath,
                  relativePath:path.relative(rootPath, filePath),
                  extension,
                  extractionVersion:extension === '.pdf' ? pdfExtractionVersion : undefined
                }
              }
            });
          } catch (error) {
            snapshot.scanErrors.push({ path:filePath, error:error instanceof Error ? error.message : String(error) });
          }
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory()) await visit(path.join(directoryPath, entry.name));
      }
    };

    await visit(rootPath);
  }

  return snapshot;
}
