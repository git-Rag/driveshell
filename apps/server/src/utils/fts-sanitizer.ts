/**
 * fts-sanitizer.ts — Safe SQLite FTS5 Query Sanitizer.
 *
 * Prevents SQLite FTS5 syntax errors (SqliteError: fts5: syntax error) and query injection
 * by sanitizing user search input into safe FTS5 query expressions.
 *
 * Rules:
 *  1. Strips null bytes and non-printable control characters (\x00-\x1f, \x7f).
 *  2. Extracts alphanumeric and unicode tokens.
 *  3. Escapes any internal double quotes (" -> "").
 *  4. Encloses individual tokens in double quotes with trailing prefix wildcard ("token"*),
 *     allowing partial / prefix matches while preventing FTS5 operators (AND, OR, NOT, NEAR,
 *     column filters, brackets, caret, etc.) from being interpreted as syntax commands.
 *  5. Returns empty string if no valid tokens exist.
 */

/**
 * Sanitizes raw user search input into a safe FTS5 MATCH expression.
 * Returns an empty string if the sanitized input contains no searchable terms.
 */
export function sanitizeFts5Query(rawQuery: string): string {
  if (typeof rawQuery !== 'string' || !rawQuery) {
    return '';
  }

  // 1. Remove control characters and null bytes
  // eslint-disable-next-line no-control-regex
  const stripped = rawQuery.replace(/[\x00-\x1f\x7f]/g, ' ');

  // 2. Tokenize by splitting on whitespace and FTS5 special punctuation characters:
  //    " * : ^ ( ) { } [ ] + - ~ AND OR NOT NEAR
  // Match contiguous sequences of word characters (supporting unicode letters and digits)
  // or non-punctuation tokens.
  const rawTokens = stripped.match(/[\p{L}\p{N}_]+/gu);
  if (!rawTokens || rawTokens.length === 0) {
    return '';
  }

  // 3. Filter out tokens that are only punctuation or empty, escape quotes, and format as prefix terms
  const safeTerms: string[] = [];
  for (const token of rawTokens) {
    const cleaned = token.trim();
    if (cleaned.length === 0) continue;

    // Inside SQLite FTS5, a quoted string "term" is tokenized literally.
    // Escape internal double quotes by doubling them.
    const escaped = cleaned.replace(/"/g, '""');
    // Append * for prefix matching: "word"*
    safeTerms.push(`"${escaped}"*`);
  }

  return safeTerms.join(' ');
}
