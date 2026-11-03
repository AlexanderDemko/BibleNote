import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileConfirmedVerseMap, DEFAULT_VERSE_ID_REGISTRY } from './mybible-verse-map-compiler.js';

type CliOptions = {
  mapPath?: string;
  outputPath?: string;
  verseIdRegistry?: string;
  coordinateReferenceModule?: string;
  referenceDifferencesManifestPath?: string;
  referencePath?: string;
  modulePath?: string;
  directMappingsOutputPath?: string;
  force: boolean;
  help: boolean;
};

const helpText = `
Compile a fully confirmed verse map to a read-only lookup SQLite database.

Usage:
  npm run mybible:compile-map -- --map <map.json> --output <map.sqlite>

Options:
  --map <path>                 Confirmed editable verse map
  --verse-id-registry <id>    Neutral VerseId namespace (default: bnverse:v1)
  --coordinate-reference-module <id>
                               Module seeding registry coordinates (default: kjv)
  --reference-differences-manifest <path>
                               Bridge module manifest with legacy differences relative to KJV
  --output, -o <path>         Compiled SQLite output
  --reference <path>          Override stored reference source path
  --module <path>             Override stored module source path
  --direct-mappings-output <path>
                               Write a BibleNote manifest mapping XML element
  --force                     Preserve existing output as a timestamped backup and replace it
  --help, -h                  Show this help
`.trim();

function nextValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseCompileVerseMapArgs(args: string[]): CliOptions {
  const options: CliOptions = { force: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    switch (argument) {
      case '--map':
        options.mapPath = nextValue(args, index, argument);
        index++;
        break;
      case '--output':
      case '-o':
        options.outputPath = nextValue(args, index, argument);
        index++;
        break;
      case '--verse-id-registry':
      case '--canonical-system':
        options.verseIdRegistry = nextValue(args, index, argument);
        index++;
        break;
      case '--coordinate-reference-module':
      case '--canonical-reference-module':
        options.coordinateReferenceModule = nextValue(args, index, argument);
        index++;
        break;
      case '--reference-differences-manifest':
        options.referenceDifferencesManifestPath = nextValue(args, index, argument);
        index++;
        break;
      case '--reference':
        options.referencePath = nextValue(args, index, argument);
        index++;
        break;
      case '--module':
        options.modulePath = nextValue(args, index, argument);
        index++;
        break;
      case '--direct-mappings-output':
        options.directMappingsOutputPath = nextValue(args, index, argument);
        index++;
        break;
      case '--force':
        options.force = true;
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

export async function runCompileVerseMapCli(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseCompileVerseMapArgs(args);
    if (options.help) {
      console.log(helpText);
      return 0;
    }
    if (!options.mapPath || !options.outputPath) {
      throw new Error('--map and --output are required.');
    }
    const summary = await compileConfirmedVerseMap({
      mapPath: options.mapPath,
      outputPath: options.outputPath,
      verseIdRegistry: options.verseIdRegistry ?? DEFAULT_VERSE_ID_REGISTRY,
      coordinateReferenceModule: options.coordinateReferenceModule ?? 'kjv',
      referenceDifferencesManifestPath: options.referenceDifferencesManifestPath,
      referencePath: options.referencePath,
      modulePath: options.modulePath,
      directMappingsOutputPath: options.directMappingsOutputPath,
      force: options.force
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Use --help for usage.');
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = await runCompileVerseMapCli();
