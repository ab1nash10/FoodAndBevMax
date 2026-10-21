import type { SortOrder } from '@aahar/api-client';

export interface SortChoice {
  label: string;
  /** `field:order`, e.g. `createdAt:desc`. */
  value: string;
}

/**
 * Every list's sort as one menu of plain choices: a field and a direction in words ("Newest
 * first", "Name A–Z", "Most available"), the more useful direction of each field first.
 */
export function sortChoices(fields: ReadonlyArray<{ label: string; value: string }>): SortChoice[] {
  return fields.flatMap(({ label, value }) => {
    const pair = (first: [SortOrder, string], second: [SortOrder, string]): SortChoice[] => [
      { label: first[1], value: `${value}:${first[0]}` },
      { label: second[1], value: `${value}:${second[0]}` },
    ];

    if (value === 'createdAt') return pair(['desc', 'Newest first'], ['asc', 'Oldest first']);
    if (/^(updatedAt|lastUpdated)/.test(value)) {
      return pair(['desc', 'Recently updated'], ['asc', 'Least recently updated']);
    }
    if (/expir/i.test(value)) return pair(['asc', 'Expiring soonest'], ['desc', 'Expiring last']);
    if (/(At|On|Date|DateTime)$/.test(value)) {
      return pair(['desc', `${label}, newest first`], ['asc', `${label}, oldest first`]);
    }
    if (/qty|quantity/i.test(value)) {
      const what = label.replace(/\s*qty$/i, '').toLowerCase();

      return pair(['desc', `Most ${what}`], ['asc', `Least ${what}`]);
    }
    if (value === 'isActive') return pair(['desc', 'Active first'], ['asc', 'Inactive first']);
    if (/^(is|eligible|has)[A-Z]/.test(value)) {
      return pair(['desc', `${label} first`], ['asc', `${label} last`]);
    }

    return pair(['asc', `${label} A–Z`], ['desc', `${label} Z–A`]);
  });
}
