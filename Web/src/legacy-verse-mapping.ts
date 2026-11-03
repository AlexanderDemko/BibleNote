import fs from 'node:fs';
import path from 'node:path';
import type { VerseMapDocument, VerseMapEntry, VerseMapLocation } from './mybible-verse-map.js';

export type VerseCoordinate = Pick<VerseMapLocation, 'bookIndex' | 'chapter' | 'verse'>;

export type LegacyVerseRelation = {
  reference: VerseCoordinate;
  module: VerseCoordinate;
  skipCheck: boolean;
};

export type LegacyVerseMappings = {
  manifestPath: string;
  moduleId: string;
  relations: LegacyVerseRelation[];
};

export type RegistryCoordinateProjection = {
  coordinateReferenceModule: string;
  bridgeModule: string;
  legacyRelations: number;
  entries: VerseMapEntry[];
};

function xmlDecode(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z][\w.-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    result[match[1].toLowerCase()] = xmlDecode(match[3]);
  }
  return result;
}

function coordinateKey(location: VerseCoordinate): string {
  return `${location.bookIndex}:${location.chapter}:${location.verse}`;
}

function relativeValue(expression: string, baseValue: number): number {
  const trimmed = expression.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const relative = /^X(?:([+-])(\d+))?$/.exec(trimmed);
  if (!relative) throw new Error(`Unsupported legacy coordinate formula: '${expression}'.`);
  const delta = relative[2] ? Number(relative[2]) * (relative[1] === '-' ? -1 : 1) : 0;
  return baseValue + delta;
}

function baseCoordinates(bookIndex: number, formula: string): VerseCoordinate[] {
  const match = /^(\d+):(\d+)(?:-(\d+))?$/.exec(formula.trim());
  if (!match) throw new Error(`Unsupported legacy base verse formula: '${formula}'.`);
  const chapter = Number(match[1]);
  const firstVerse = Number(match[2]);
  const lastVerse = Number(match[3] ?? match[2]);
  if (chapter < 1 || firstVerse < 1 || lastVerse < firstVerse) {
    throw new Error(`Invalid legacy base verse formula: '${formula}'.`);
  }
  return Array.from({ length:lastVerse - firstVerse + 1 }, (_, index) => ({
    bookIndex,
    chapter,
    verse:firstVerse + index
  }));
}

function parallelCoordinates(base: VerseCoordinate[], formula: string): Array<{ reference: VerseCoordinate; module: VerseCoordinate }> {
  if (!formula.trim()) return [];
  const result: Array<{ reference: VerseCoordinate; module: VerseCoordinate }> = [];
  for (const formulaPart of formula.split(',')) {
    const colon = formulaPart.indexOf(':');
    if (colon < 0 || formulaPart.indexOf(':', colon + 1) >= 0) {
      throw new Error(`Unsupported legacy parallel verse formula: '${formulaPart}'.`);
    }
    const chapterExpression = formulaPart.slice(0, colon).trim();
    const verseExpression = formulaPart.slice(colon + 1).replace(/\(\d+\)/g, '').trim();
    const concreteRange = /^(\d+)(?:-(\d+))?$/.exec(verseExpression);
    if (concreteRange) {
      const firstVerse = Number(concreteRange[1]);
      const lastVerse = Number(concreteRange[2] ?? concreteRange[1]);
      if (firstVerse < 1 || lastVerse < firstVerse) throw new Error(`Invalid legacy verse range: '${formulaPart}'.`);
      const moduleVerses = Array.from({ length:lastVerse - firstVerse + 1 }, (_, index) => firstVerse + index);
      if (base.length === 1) {
        for (const verse of moduleVerses) {
          result.push({
            reference:base[0],
            module:{ bookIndex:base[0].bookIndex, chapter:relativeValue(chapterExpression, base[0].chapter), verse }
          });
        }
      } else if (moduleVerses.length === 1) {
        for (const reference of base) {
          result.push({
            reference,
            module:{ bookIndex:reference.bookIndex, chapter:relativeValue(chapterExpression, reference.chapter), verse:moduleVerses[0] }
          });
        }
      } else {
        if (moduleVerses.length !== base.length) {
          throw new Error(`Legacy ranges have different lengths: '${formulaPart}'.`);
        }
        for (let index = 0; index < base.length; index++) {
          const reference = base[index];
          result.push({
            reference,
            module:{ bookIndex:reference.bookIndex, chapter:relativeValue(chapterExpression, reference.chapter), verse:moduleVerses[index] }
          });
        }
      }
      continue;
    }
    for (const reference of base) {
      const module = {
        bookIndex:reference.bookIndex,
        chapter:relativeValue(chapterExpression, reference.chapter),
        verse:relativeValue(verseExpression, reference.verse)
      };
      if (module.chapter < 1 || module.verse < 1) throw new Error(`Invalid legacy parallel coordinate: '${formulaPart}'.`);
      result.push({ reference, module });
    }
  }
  return result;
}

export function parseLegacyVerseMappingsXml(manifestPath: string, xml: string): LegacyVerseMappings {
  const root = /<BibleNoteModule\b([^>]*)>/i.exec(xml);
  if (!root) throw new Error(`${manifestPath} is not a BibleNote manifest.`);
  const moduleId = attributes(root[1]).shortname?.trim();
  if (!moduleId) throw new Error(`${manifestPath} has no BibleNote module ShortName.`);
  const relationKeys = new Set<string>();
  const relations: LegacyVerseRelation[] = [];
  for (const bookMatch of xml.matchAll(/<BookDifferences\b([^>]*)>([\s\S]*?)<\/BookDifferences\s*>/gi)) {
    const bookIndex = Number(attributes(bookMatch[1]).bookindex);
    if (!Number.isInteger(bookIndex) || bookIndex < 1) throw new Error(`Invalid BookDifferences BookIndex in ${manifestPath}.`);
    for (const differenceMatch of bookMatch[2].matchAll(/<Difference\b([^>]*?)(?:\/\s*>|>[\s\S]*?<\/Difference\s*>)/gi)) {
      const difference = attributes(differenceMatch[1]);
      const baseFormula = difference.baseverses ?? '';
      const parallelFormula = difference.parallelverses ?? '';
      if (!baseFormula) throw new Error(`Empty BaseVerses is not supported in ${manifestPath}.`);
      const base = baseCoordinates(bookIndex, baseFormula);
      for (const relation of parallelCoordinates(base, parallelFormula)) {
        const key = `${coordinateKey(relation.reference)}>${coordinateKey(relation.module)}`;
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);
        relations.push({ ...relation, skipCheck:difference.skipcheck?.toLowerCase() === 'true' });
      }
    }
  }
  return { manifestPath, moduleId, relations };
}

export function readLegacyVerseMappings(manifestPath: string): LegacyVerseMappings {
  const resolved = path.resolve(manifestPath);
  return parseLegacyVerseMappingsXml(resolved, fs.readFileSync(resolved, 'utf8'));
}

function registryLocation(location: VerseCoordinate): VerseMapLocation {
  return { ...location, sourceBookNumber:location.bookIndex, empty:false };
}

function uniqueLocations(locations: VerseMapLocation[]): VerseMapLocation[] {
  const seen = new Set<string>();
  return locations.filter(location => {
    const key = coordinateKey(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function projectVerseMapToRegistryCoordinates(
  document: VerseMapDocument,
  coordinateReferenceModule: string,
  referenceDifferencesManifestPath?: string
): RegistryCoordinateProjection {
  const coordinateModule = coordinateReferenceModule.trim().toLowerCase();
  if (!coordinateModule) throw new Error('Coordinate reference module is required.');
  const bridgeModule = document.reference.moduleId.trim().toLowerCase();
  if (bridgeModule === coordinateModule) {
    return {
      coordinateReferenceModule:coordinateModule,
      bridgeModule,
      legacyRelations:0,
      entries:document.entries.map(entry => ({ ...entry, reference:entry.reference.map(location => ({ ...location })) }))
    };
  }
  if (!referenceDifferencesManifestPath) {
    throw new Error(
      `Reference module '${document.reference.moduleId}' is a comparison bridge, not coordinate module '${coordinateModule}'. `
      + 'Provide its legacy differences manifest to compose registry coordinates.'
    );
  }
  const legacy = readLegacyVerseMappings(referenceDifferencesManifestPath);
  if (legacy.moduleId.toLowerCase() !== bridgeModule) {
    throw new Error(
      `Legacy differences manifest belongs to '${legacy.moduleId}', but the verse map reference is '${document.reference.moduleId}'.`
    );
  }
  const referencesByBridge = new Map<string, VerseCoordinate[]>();
  for (const relation of legacy.relations) {
    const key = coordinateKey(relation.module);
    referencesByBridge.set(key, [...(referencesByBridge.get(key) ?? []), relation.reference]);
  }
  const entries = document.entries.map(entry => ({
    ...entry,
    reference:uniqueLocations(entry.reference.flatMap(location => {
      const registryReferences = referencesByBridge.get(coordinateKey(location));
      return registryReferences?.length ? registryReferences.map(registryLocation) : [registryLocation(location)];
    }))
  }));
  return {
    coordinateReferenceModule:coordinateModule,
    bridgeModule,
    legacyRelations:legacy.relations.length,
    entries
  };
}
