import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('packages/shared browser-compatibility', () => {
  it('has zero Node-only module imports (fs, path, crypto, child_process, os, buffer)', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.js'))) {
          files.push(full);
        }
      }
    }

    walk(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const forbiddenImports = [
      /\bfrom\s+['"]node:/,
      /\bfrom\s+['"]fs['"]/,
      /\bfrom\s+['"]path['"]/,
      /\bfrom\s+['"]crypto['"]/,
      /\bfrom\s+['"]child_process['"]/,
      /\bfrom\s+['"]os['"]/,
      /\bfrom\s+['"]buffer['"]/,
      /\bimport\(['"]node:/,
      /\brequire\(['"]node:/,
      /\bBuffer\.from\b/,
      /\bBuffer\.alloc\b/,
      /\bprocess\.env\b/,
    ];

    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((lineText, idx) => {
        // Ignore comments
        const trimmed = lineText.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

        for (const pattern of forbiddenImports) {
          if (pattern.test(lineText)) {
            violations.push({ file: path.relative(srcDir, file), line: idx + 1, text: trimmed });
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
