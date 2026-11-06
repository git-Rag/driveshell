/**
 * fts-sanitizer.test.ts — Rigorous unit tests and fuzz testing for FTS5 sanitizer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { sanitizeFts5Query } from '../src/utils/fts-sanitizer';

describe('FTS5 Query Sanitizer', () => {
  it('extracts and formats normal search words', () => {
    expect(sanitizeFts5Query('sunset photo')).toBe('"sunset"* "photo"*');
    expect(sanitizeFts5Query('invoice 2024')).toBe('"invoice"* "2024"*');
  });

  it('supports unicode and international characters', () => {
    expect(sanitizeFts5Query('café résumé')).toBe('"café"* "résumé"*');
    expect(sanitizeFts5Query('東京 日本')).toBe('"東京"* "日本"*');
  });

  it('strips null bytes and control characters', () => {
    expect(sanitizeFts5Query('evil\x00file\r\nname')).toBe('"evil"* "file"* "name"*');
  });

  it('safely neutralizes unmatched quotes and FTS5 operators', () => {
    expect(sanitizeFts5Query('"unmatched quote')).toBe('"unmatched"* "quote"*');
    expect(sanitizeFts5Query('photo AND NOT secret')).toBe('"photo"* "AND"* "NOT"* "secret"*');
    expect(sanitizeFts5Query('NEAR(a, b, 10)')).toBe('"NEAR"* "a"* "b"* "10"*');
    expect(sanitizeFts5Query('name:test* {col:val}')).toBe('"name"* "test"* "col"* "val"*');
    expect(sanitizeFts5Query('^^^***+++---')).toBe('');
  });

  it('returns empty string for empty or whitespace-only queries', () => {
    expect(sanitizeFts5Query('')).toBe('');
    expect(sanitizeFts5Query('    ')).toBe('');
    expect(sanitizeFts5Query(':::;;;***')).toBe('');
  });
});

describe('FTS5 Sanitizer SQLite Fuzz Testing', () => {
  let db: Database;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    db.exec(`
      CREATE VIRTUAL TABLE test_fts USING fts5(name, tokenize = 'trigram');
      INSERT INTO test_fts (name) VALUES
        ('sunset at the beach.jpg'),
        ('invoice-2024-Q1.pdf'),
        ('family vacation photo.png'),
        ('financial report final.xlsx');
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('executes safely against SQLite FTS5 for 500 hostile generated query patterns', () => {
    const hostileFragments = [
      '"',
      '""',
      '"""',
      "'",
      "''",
      '*',
      '**',
      '***',
      'AND',
      'OR',
      'NOT',
      'NEAR',
      'MATCH',
      ':',
      '::',
      '^',
      '^^',
      '(',
      ')',
      '((',
      '))',
      '()',
      '{',
      '}',
      '{{',
      '}}',
      '[',
      ']',
      '+',
      '-',
      '~',
      '\\',
      '/',
      '\0',
      '\x01',
      '\x1f',
      '\r\n',
      'col:val',
      'name:secret',
      'SELECT',
      'DROP TABLE',
      '1=1',
      '--',
      'café',
      '日本語',
      'emoji✨🔥',
    ];

    const matchStmt = db.prepare<[string], { name: string }>(
      'SELECT name FROM test_fts WHERE test_fts MATCH ?',
    );

    for (let i = 0; i < 500; i++) {
      // Generate randomized hostile strings of varying length
      const numFrags = 1 + (i % 6);
      const parts: string[] = [];
      for (let j = 0; j < numFrags; j++) {
        const randIndex = (i * 17 + j * 31) % hostileFragments.length;
        parts.push(hostileFragments[randIndex]!);
      }
      const rawHostileQuery = parts.join(' ');
      const sanitized = sanitizeFts5Query(rawHostileQuery);

      if (sanitized.length > 0) {
        // Assert: must NEVER throw SqliteError (fts5: syntax error)
        expect(() => {
          matchStmt.all(sanitized);
        }).not.toThrow();
      }
    }
  });
});
