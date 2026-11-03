import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { seedBundledBibleModules } from '../src/bundled-bible-modules.js';

test('bundled Bible modules are installed once without replacing user modules', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-modules-'));
  try {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(path.join(source, 'rst'), { recursive:true });
    fs.mkdirSync(path.join(source, 'kjv'), { recursive:true });
    fs.mkdirSync(path.join(target, 'rst'), { recursive:true });
    fs.writeFileSync(path.join(source, 'rst', 'manifest.xml'), 'bundled');
    fs.writeFileSync(path.join(source, 'kjv', 'manifest.xml'), 'bundled');
    fs.writeFileSync(path.join(target, 'rst', 'manifest.xml'), 'user');

    assert.deepEqual(seedBundledBibleModules(source, target), ['kjv']);
    assert.equal(fs.readFileSync(path.join(target, 'rst', 'manifest.xml'), 'utf8'), 'user');
    assert.equal(fs.readFileSync(path.join(target, 'kjv', 'manifest.xml'), 'utf8'), 'bundled');
    assert.deepEqual(seedBundledBibleModules(source, target), []);
  } finally {
    fs.rmSync(root, { recursive:true, force:true });
  }
});
