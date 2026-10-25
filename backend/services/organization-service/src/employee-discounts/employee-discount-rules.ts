import type { EmploymentType } from '@prisma/client';
import { isInSchedule } from '../pos/pos-pricing';

export interface DiscountRule {
  daysOfWeek: readonly string[];
  discountPercent: number;
  employmentType: EmploymentType | null;
  endTime: string | null;
  id: string;
  name: string;
  startTime: string | null;
}

/**
 * The rule an employee's bill gets at `now`: among a restaurant's live rules, those for every
 * employee or for this employee's level, on today's serve days and inside their special timings
 * (India time). The highest percentage wins; none matching means no discount. An employee with
 * no recorded level gets only the rules for every employee.
 */
export function bestDiscountRule<Rule extends DiscountRule>(
  rules: readonly Rule[],
  employmentType: EmploymentType | null,
  now: Date,
): Rule | null {
  let best: Rule | null = null;

  for (const rule of rules) {
    const forThisLevel = rule.employmentType === null || rule.employmentType === employmentType;
    const onNow = isInSchedule(
      { days: rule.daysOfWeek, from: rule.startTime, to: rule.endTime },
      now,
    );

    if (forThisLevel && onNow && (!best || rule.discountPercent > best.discountPercent)) {
      best = rule;
    }
  }

  return best;
}
