/**
 * The naming convention for everything people type as a name, shared by every service (the
 * portal keeps the same rules in lib/names.ts, and the 20261021160000 migration in SQL):
 *
 * - Title Case: each word starts with a capital, the rest lower case.
 * - Small joining words (and, of, the …) stay lower case unless they start the name or follow "(".
 * - Short all-capital words are acronyms and stay as typed: up to 3 letters, or any length
 *   without a vowel (BLK, DDF, PPN, MSSH, HSBC).
 * - A few abbreviations have one spelling: Dr, Ltd, Pvt, Co, Inc, Mr, Mrs, Ms, and the brand Max.
 * - A word typed in deliberately mixed case keeps it (McDonald), with a capital first letter.
 * - Letters straight after an apostrophe or a digit are left alone (McDonald's, 7up, 2nd).
 */

const smallWords = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const fixedWords: Record<string, string> = {
  co: 'Co',
  dr: 'Dr',
  inc: 'Inc',
  ltd: 'Ltd',
  max: 'Max',
  mr: 'Mr',
  mrs: 'Mrs',
  ms: 'Ms',
  pvt: 'Pvt',
};

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function titleCase(value: string): string {
  const tokens =
    value
      .trim()
      .replace(/\s+/g, ' ')
      .match(/[A-Za-z]+|[^A-Za-z]+/g) ?? [];
  let previous = '';
  let seenWord = false;

  return tokens
    .map((token) => {
      let out = token;

      if (/^[A-Za-z]/.test(token)) {
        const lower = token.toLowerCase();

        // After an apostrophe or a digit the letters belong to the word before (McDonald's, 7up).
        if (/['’0-9]$/.test(previous)) {
          out = token;
        } else if (Object.hasOwn(fixedWords, lower)) {
          out = fixedWords[lower]!;
        } else if (smallWords.has(lower)) {
          out = !seenWord || /[([]\s*$/.test(previous) ? capitalise(lower) : lower;
        } else if (
          token !== token.toUpperCase() &&
          token !== lower &&
          !/^[A-Z][a-z]*$/.test(token)
        ) {
          out = capitalise(token);
        } else if (token === token.toUpperCase() && (token.length <= 3 || !/[AEIOU]/.test(token))) {
          out = token;
        } else {
          out = capitalise(lower);
        }

        seenWord = true;
      }

      previous = token;

      return out;
    })
    .join('');
}

/** Codes are identifiers: trimmed and upper case (Max-02 → MAX-02). */
export function codeCase(value: string): string {
  return value.trim().toUpperCase();
}
