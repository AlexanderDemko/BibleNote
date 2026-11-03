import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createVerseMapDraft,
  readVerseMapDocument,
  validateVerseMapDocument
} from './mybible-verse-map.js';

type CliOptions = {
  referencePath?: string;
  modulePath?: string;
  referenceDifferencesManifestPath?: string;
  validatePath?: string;
  outputPath?: string;
  help: boolean;
};

const helpText = `
Create or validate an explicit BibleNote verse map.

Create a draft:
  npm run mybible:map -- --reference <RST.xml|RST.bnm|RST.SQLite3> --module <module.SQLite3> [--reference-differences-manifest manifest.xml] [--output map.json]

Validate an edited map:
  npm run mybible:map -- --validate <map.json> [--reference path] [--module path] [--output validation.json]

Options:
  --reference, -r <path>   Reference BibleNote/MyBible module
  --module, -m <path>      Module being mapped
  --reference-differences-manifest <path>
                            Known numbering differences of the comparison module (auto-detected next to it)
  --validate <path>        Validate an existing editable map
  --output, -o <path>      Write JSON to a file instead of stdout
  --help, -h               Show this help

Supported sources: MyBible .SQLite3, BibleNote/Zefania bible.xml, and BibleNote .bnm.
Structurally unambiguous identity groups are confirmed automatically. Only holes and disputed passages remain 'candidate'.
`.trim();

function nextValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a path.`);
  return value;
}

export function parseVerseMapArgs(args: string[]): CliOptions {
  const options: CliOptions = { help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    switch (argument) {
      case '--reference':
      case '-r':
        options.referencePath = nextValue(args, index, argument);
        index++;
        break;
      case '--module':
      case '-m':
        options.modulePath = nextValue(args, index, argument);
        index++;
        break;
      case '--reference-differences-manifest':
        options.referenceDifferencesManifestPath = nextValue(args, index, argument);
        index++;
        break;
      case '--validate':
        options.validatePath = nextValue(args, index, argument);
        index++;
        break;
      case '--output':
      case '-o':
        options.outputPath = nextValue(args, index, argument);
        index++;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function writeJson(value: unknown, outputPath?: string): void {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(json);
    return;
  }
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, json, 'utf8');
  console.error(`Verse map output written to ${resolved}`);
}

export async function runVerseMapCli(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseVerseMapArgs(args);
    if (options.help) {
      console.log(helpText);
      return 0;
    }
    if (options.validatePath) {
      const document = readVerseMapDocument(options.validatePath);
      const validation = await validateVerseMapDocument(document, {
        referencePath: options.referencePath,
        modulePath: options.modulePath
      });
      writeJson({ map: path.resolve(options.validatePath), validation }, options.outputPath);
      const valid = validation.sourceChecks.referenceFingerprintMatches
        && validation.sourceChecks.moduleFingerprintMatches
        && validation.confirmedOnly.isCompleteAndConsistent;
      return valid ? 0 : 2;
    }
    if (!options.referencePath || !options.modulePath) {
      throw new Error('--reference and --module are required when creating a draft.');
    }
    const document = await createVerseMapDraft({
      referencePath: options.referencePath,
      modulePath: options.modulePath,
      referenceDifferencesManifestPath: options.referenceDifferencesManifestPath
    });
    writeJson(document, options.outputPath);
    return document.validation.candidateAndConfirmed.isCompleteAndConsistent ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Use --help for usage.');
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = await runVerseMapCli();
