import fs from 'node:fs';
import path from 'node:path';

export function seedBundledBibleModules(sourceRoot: string, targetRoot: string): string[] {
  if (!fs.existsSync(sourceRoot)) return [];

  const seeded: string[] = [];
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes:true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(targetRoot, entry.name);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(targetRoot, { recursive:true });
    fs.cpSync(path.join(sourceRoot, entry.name), target, { recursive:true });
    seeded.push(entry.name);
  }
  return seeded;
}
