import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertMyBibleModule } from './mybible-converter.js';
import { DEFAULT_VERSE_ID_REGISTRY } from './verse-id.js';

type CliOptions = {
  biblePath?: string;
  referenceManifestPath?: string;
  outputPath?: string;
  shortName?: string;
  footnotesPath?: string | false;
  preserveAllFootnotes?: boolean;
  directMappingsPath?: string;
  coordinateReferenceModule?: string;
  verseIdRegistry?: string;
  allowUnmappedPreview: boolean;
  force: boolean;
  help: boolean;
};

const helpText = `
Convert a MyBible Bible SQLite module into a BibleNote .bnm package.

Usage:
  npm run mybible:convert -- --bible <module.SQLite3> --short-name <id> \\
    --reference-manifest <manifest.xml> --output <module.bnm>

Options:
  --bible <path>                 MyBible Bible module
  --short-name <id>              BibleNote module id
  --reference-manifest <path>    Manifest supplying established book aliases
  --direct-mappings <path>       Confirmed BibleDirectVerseMappings XML from compile-map
  --coordinate-reference-module <id>
                                 Required ReferenceModule in the mapping (default: kjv)
  --verse-id-registry <id>       Required neutral registry (default: bnverse:v1)
  --allow-unmapped-preview       Build a non-installable preview without a confirmed map
  --footnotes <path>             Explicit MyBible footnotes companion
  --all-footnotes                Preserve companion notes without inline markers too
  --no-footnotes                 Disable same-name companion discovery
  --output, -o <path>            Output .bnm package
  --force                        Preserve an existing output as a timestamped backup
  --help, -h                     Show this help
`.trim();

function nextValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseMyBibleConverterArgs(args: string[]): CliOptions {
  const options: CliOptions = { allowUnmappedPreview:false, force: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    switch (argument) {
      case '--bible': options.biblePath = nextValue(args, index, argument); index++; break;
      case '--short-name': options.shortName = nextValue(args, index, argument); index++; break;
      case '--reference-manifest': options.referenceManifestPath = nextValue(args, index, argument); index++; break;
      case '--direct-mappings': options.directMappingsPath = nextValue(args, index, argument); index++; break;
      case '--coordinate-reference-module':
      case '--canonical-reference-module': options.coordinateReferenceModule = nextValue(args, index, argument); index++; break;
      case '--verse-id-registry': options.verseIdRegistry = nextValue(args, index, argument); index++; break;
      case '--allow-unmapped-preview': options.allowUnmappedPreview = true; break;
      case '--footnotes': options.footnotesPath = nextValue(args, index, argument); index++; break;
      case '--no-footnotes': options.footnotesPath = false; break;
      case '--all-footnotes': options.preserveAllFootnotes = true; break;
      case '--output': case '-o': options.outputPath = nextValue(args, index, argument); index++; break;
      case '--force': options.force = true; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export async function runMyBibleConverterCli(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseMyBibleConverterArgs(args);
    if (options.help) {
      console.log(helpText);
      return 0;
    }
    if (!options.biblePath || !options.referenceManifestPath || !options.outputPath || !options.shortName) {
      throw new Error('--bible, --short-name, --reference-manifest, and --output are required.');
    }
    const summary = await convertMyBibleModule({
      biblePath: options.biblePath,
      referenceManifestPath: options.referenceManifestPath,
      outputPath: options.outputPath,
      shortName: options.shortName,
      footnotesPath: options.footnotesPath,
      preserveAllFootnotes: options.preserveAllFootnotes,
      directMappingsPath: options.directMappingsPath,
      coordinateReferenceModule: options.coordinateReferenceModule ?? 'kjv',
      verseIdRegistry: options.verseIdRegistry ?? DEFAULT_VERSE_ID_REGISTRY,
      allowUnmappedPreview: options.allowUnmappedPreview,
      force: options.force
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary.footnoteMarkersUnresolved === 0 ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Use --help for usage.');
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = await runMyBibleConverterCli();
