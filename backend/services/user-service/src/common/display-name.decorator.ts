import { codeCase, titleCase } from '@aahar/config';
import { Transform } from 'class-transformer';

const whenText = (rule: (value: string) => string) =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? rule(value) : value));

/**
 * A name people type, saved in the naming convention (Title Case, acronyms kept; see
 * @aahar/config naming). Runs as the request is read, before validation, so update DTOs
 * (PartialType) get it too.
 */
export const DisplayName = () => whenText(titleCase);

/** A code people type (store, kitchen, location codes …), saved upper case. */
export const CodeCase = () => whenText(codeCase);
