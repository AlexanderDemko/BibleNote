import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startVerseMapReviewServer } from './mybible-verse-map-review.js';

type CliOptions = {
  mapPath?: string;
  referencePath?: string;
  modulePath?: string;
  footnotesPath?: string;
  port: number;
  help: boolean;
};

const helpText = `
Review and confirm verse-map groups in a local browser UI.

Usage:
  npm run mybible:review -- --map <map.json> [--port 4313]

Options:
  --map <path>          Editable verse-map JSON
  --reference <path>    Override stored reference source path
  --module <path>       Override stored module source path
  --footnotes <path>    MyBible *.commentaries.SQLite3 companion
  --port <number>       Loopback port (default: 4313; 0 chooses a free port)
  --help, -h            Show this help
`.trim();

function nextValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseReviewVerseMapArgs(args: string[]): CliOptions {
  const options: CliOptions = { port: 4313, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    switch (argument) {
      case '--map':
        options.mapPath = nextValue(args, index, argument);
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
      case '--footnotes':
        options.footnotesPath = nextValue(args, index, argument);
        index++;
        break;
      case '--port': {
        const port = Number(nextValue(args, index, argument));
        if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('--port must be an integer from 0 to 65535.');
        options.port = port;
        index++;
        break;
      }
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

export async function runReviewVerseMapCli(args = process.argv.slice(2)): Promise<number> {
  try {
    const options = parseReviewVerseMapArgs(args);
    if (options.help) {
      console.log(helpText);
      return 0;
    }
    if (!options.mapPath) throw new Error('--map is required.');
    const review = await startVerseMapReviewServer({
      mapPath: options.mapPath,
      referencePath: options.referencePath,
      modulePath: options.modulePath,
      footnotesPath: options.footnotesPath,
      port: options.port
    });
    console.log(`Verse-map review UI: ${review.url}`);
    console.log(`Map: ${review.mapPath}`);
    console.log('Press Ctrl+C to stop.');
    await new Promise<void>(resolve => {
      const stop = async () => {
        process.off('SIGINT', stop);
        process.off('SIGTERM', stop);
        await review.close();
        resolve();
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Use --help for usage.');
    return 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) process.exitCode = await runReviewVerseMapCli();
