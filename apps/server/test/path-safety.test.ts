/**
 * path-safety.test.ts — Rigorous unit test table of hostile Windows and POSIX path traversal vectors.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveSafePath, PathTraversalError } from '../src/utils/path-safety';

describe('Path Safety Helper (resolveSafePath)', () => {
  const baseDir = path.resolve('data', 'cache');

  it('allows safe relative filenames and nested directories', () => {
    const validPaths = [
      'thumb.jpg',
      'photos/thumb_123.jpg',
      'a/b/c/file.png',
      'my-backup-2026.db',
      'dot.file.name',
    ];

    for (const valid of validPaths) {
      const resolved = resolveSafePath(baseDir, valid);
      expect(resolved.startsWith(baseDir)).toBe(true);
      expect(path.basename(resolved)).toBe(path.basename(valid));
    }
  });

  describe('Hostile Path Traversal Attack Table', () => {
    const hostileAttackVectors = [
      // POSIX Directory Traversal
      '../etc/passwd',
      '../../etc/shadow',
      '../../../root/.ssh/id_rsa',
      'dir/../../secret.txt',
      './../secret.txt',
      'photos/../../../etc/passwd',
      '..//..//etc//passwd',

      // Windows Directory Traversal
      '..\\..\\Windows\\System32\\calc.exe',
      '..\\..\\Windows\\win.ini',
      'dir\\..\\..\\secret.txt',
      'subdir\\..\\..\\..\\autoexec.bat',

      // Absolute Path Injections
      '/etc/passwd',
      'C:\\Windows\\System32\\cmd.exe',
      'D:\\Workspace\\secret.db',
      '\\\\attacker-server\\share\\malware.exe', // UNC path

      // Null Byte Injections
      'valid.jpg\0.exe',
      'thumb.png\0/../../etc/passwd',
      '\0../secret',

      // Windows Alternate Data Streams (ADS)
      'file.txt:hidden_stream',
      'image.jpg::$DATA',
      'thumb.png:stream:$DATA',

      // DOS Reserved Device Names (Windows)
      'CON',
      'con.txt',
      'PRN',
      'aux.jpg',
      'NUL',
      'nul.dat',
      'COM1',
      'com1.png',
      'LPT1',
      'photos/CON/thumb.jpg',
      'nested/dir/aux.png',

      // Empty and Blank
      '',
      '   ',
    ];

    for (const attack of hostileAttackVectors) {
      it(`blocks hostile vector: ${JSON.stringify(attack)}`, () => {
        expect(() => resolveSafePath(baseDir, attack)).toThrow(PathTraversalError);
      });
    }
  });
});
