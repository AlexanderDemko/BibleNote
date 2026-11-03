import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMyBibleAnalysisReport } from './mybible-analyzer.js';

type CliOptions = {
  biblePath?: string;
  commentariesPath?: string | null;
  crossReferencesPath?: string;
  compareBiblePath?: string;
  outputPath?: string;
  autoDiscoverCommentaries: boolean;
  help: boolean;
};

const helpText = `
Read-only analyzer for MyBible SQLite modules.

Usage:
  npm run mybible:analyze -- --bible <module.SQLite3> [options]

Options:
  --bible, -b <path>             Bible module to analyze (required)
  --commentaries <path>          Related footnotes/commentaries module
  --no-commentaries              Do not auto-discover <name>.commentaries.SQLite3
  --cross-references <path>      Related .crossreferences.SQLite3 module
  --compare <path>               Reference Bible SQLite for structural mapping hints
  --output, -o <path>            Write JSON to a file instead of stdout
  --help, -h                     Show this help

The analyzer opens every SQLite database in read-only/query-only mode and does not
include verse or footnote bodies in the report.
`.trim();

function nextValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a path.`);
  return value;
}

export function parseMyBibleAnalyzerArgs(args: string[]): CliOptions {
  const options: CliOptions = { autoDiscoverCommentaries: true, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    switch (argument) {
      case '--bible':
      case '-b':
        options.biblePath = nextValue(args, index, argument);
        index++;
        break;
      case '--commentaries':
        options.commentariesPath = nextValue(args, index, argument);
        index++;
        break;
      case '--no-commentaries':
        options.commentariesPath = null;
        options.autoDiscoverCommentaries = false;
        break;
      case '--cross-references':
        options.crossReferencesPath = nextValue(args, index, argument);
        index++;
        break;
      case '--compare':
        options.compareBiblePath = nextValue(args, index, argument);
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
        if (!argument.startsWith('-') && !options.biblePath) options.biblePath = argument;
        else throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export function runMyBibleAnalyzerCli(args = process.argv.slice(2)): number {
  try {
    const options = parseMyBibleAnalyzerArgs(args);
    if (options.help) {
      console.log(helpText);
      return 0;
    }
    if (!options.biblePath) throw new Error('--bible is required.');
    const report = createMyBibleAnalysisReport({
      biblePath: options.biblePath,
      commentariesPath: options.commentariesPath,
      crossReferencesPath: options.crossReferencesPath,
      autoDiscoverCommentaries: options.autoDiscoverCommentaries,
      compareBiblePath: options.compareBiblePath
    });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (options.outputPath) {
      const outputPath = path.resolve(options.outputPath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, json, 'utf8');
      console.error(`MyBible analysis report written to ${outputPath}`);
    } else {
      process.stdout.write(json);
    }
    return report.module.issues.some(issue => issue.severity === 'error') ? 2 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Use --help for usage.');
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = runMyBibleAnalyzerCli();
