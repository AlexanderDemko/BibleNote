import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { rotateRuntimeLogFiles } from '../src/runtime-logging.js';

test('runtime log rotation keeps a bounded number of backups', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-runtime-log-'));
  const logPath = path.join(directory, 'extended.log');
  try {
    for (let index = 0; index < 5; index += 1) {
      fs.writeFileSync(logPath, `entry-${index}`.repeat(30), 'utf8');
      assert.equal(rotateRuntimeLogFiles(logPath, 100, 3), true);
    }

    assert.equal(fs.existsSync(logPath), false);
    assert.equal(fs.existsSync(`${logPath}.1`), true);
    assert.equal(fs.existsSync(`${logPath}.2`), true);
    assert.equal(fs.existsSync(`${logPath}.3`), true);
    assert.equal(fs.existsSync(`${logPath}.4`), false);
    assert.ok(fs.statSync(`${logPath}.1`).size <= 100);
    assert.ok(fs.statSync(`${logPath}.2`).size <= 100);
    assert.ok(fs.statSync(`${logPath}.3`).size <= 100);
    assert.match(fs.readFileSync(`${logPath}.1`, 'utf8'), /entry-4/);
    assert.match(fs.readFileSync(`${logPath}.3`, 'utf8'), /entry-2/);
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});

test('runtime log rotation accounts for the next entry size', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'biblenote-runtime-log-pending-'));
  const logPath = path.join(directory, 'extended.log');
  try {
    fs.writeFileSync(logPath, 'x'.repeat(90), 'utf8');
    assert.equal(rotateRuntimeLogFiles(logPath, 100, 2, 11), true);
    assert.equal(fs.existsSync(logPath), false);
    assert.equal(fs.statSync(`${logPath}.1`).size, 90);
  } finally {
    fs.rmSync(directory, { recursive:true, force:true });
  }
});
