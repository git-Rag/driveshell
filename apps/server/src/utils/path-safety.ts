/**
 * path-safety.ts — Safe Path Resolution and Path Traversal Prevention.
 *
 * Enforces strict filesystem containment for all cache, backup, and file access.
 * Defends against hostile POSIX and Windows path traversal attacks.
 */

import path from 'node:path';

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

const DOS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Resolves an untrusted relative path against a trusted base directory.
 * Ensures the target path strictly resides within baseDir.
 *
 * @throws PathTraversalError if traversal, reserved names, or escape is detected.
 */
export function resolveSafePath(baseDir: string, untrustedPath: string): string {
  if (typeof untrustedPath !== 'string' || !untrustedPath.trim()) {
    throw new PathTraversalError('Path must be a non-empty string');
  }

  // 1. Disallow null bytes
  if (untrustedPath.includes('\0')) {
    throw new PathTraversalError('Null byte detected in path');
  }

  // 2. Disallow NTFS Alternate Data Streams (colon in relative path)
  // Strip drive letter if baseDir is Windows, but relative path must never contain ':'
  if (untrustedPath.includes(':')) {
    throw new PathTraversalError('Illegal colon or Alternate Data Stream in path');
  }

  // 3. Normalize and resolve base directory
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, untrustedPath);

  // 4. Strict containment check
  // Target must either be equal to baseDir or reside in a subdirectory
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PathTraversalError(`Path escapes base directory: ${untrustedPath}`);
  }

  // 5. Windows DOS device name check on each path segment
  const segments = relative.split(/[/\\]/);
  for (const seg of segments) {
    if (!seg) continue;
    const baseName = seg.split('.')[0]?.toUpperCase() ?? '';
    if (DOS_RESERVED_NAMES.has(baseName)) {
      throw new PathTraversalError(`DOS reserved device name detected: ${seg}`);
    }
  }

  return resolvedTarget;
}
