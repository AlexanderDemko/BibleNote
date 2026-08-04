import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFolderSelection } from '../src/folder-picker.js';

test('folder picker uses the opened initial folder when Windows returns no explicit child selection', () => {
  assert.deepEqual(
    resolveFolderSelection({ canceled:false, filePaths:[] }, 'C:\\Users\\Alex\\Desktop'),
    { available:true, canceled:false, folderPath:'C:\\Users\\Alex\\Desktop' }
  );
});

test('folder picker prefers an explicit selection and preserves cancellation', () => {
  assert.deepEqual(
    resolveFolderSelection({ canceled:false, filePaths:['C:\\Notes'] }, 'C:\\Users\\Alex\\Desktop'),
    { available:true, canceled:false, folderPath:'C:\\Notes' }
  );
  assert.deepEqual(
    resolveFolderSelection({ canceled:true, filePaths:[] }, 'C:\\Users\\Alex\\Desktop'),
    { available:true, canceled:true }
  );
});
