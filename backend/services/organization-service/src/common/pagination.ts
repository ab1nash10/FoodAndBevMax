import type { PaginationQueryDto, SortOrder } from './dto/pagination-query.dto';

export interface PageMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export function getPagination(query: PaginationQueryDto): { limit: number; page: number } {
  return {
    limit: query.limit ?? 20,
    page: query.page ?? 1,
  };
}

export function getPageMeta(page: number, limit: number, total: number): PageMeta {
  return {
    limit,
    page,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * A list query's Prisma orderBy: `[{ [sortBy]: sortOrder }, { id: sortOrder }]`, falling back to
 * the given defaults. The id breaks ties: rows sharing a date or name would otherwise come back
 * in any order, so a page boundary between them could repeat one row and skip another.
 */
export function getOrderBy<Field extends string>(
  query: { sortBy?: Field; sortOrder?: SortOrder },
  defaultField: Field,
  defaultOrder: SortOrder = 'desc',
): { [field: string]: SortOrder }[] {
  const sortBy: Field = query.sortBy ?? defaultField;
  const order = query.sortOrder ?? defaultOrder;

  return [{ [sortBy]: order }, { id: order }];
}

/**
 * getOrderBy for a list whose `numberField` is a document number (TRF0042, GRN000123). Numbers
 * come from a sequence, so their order is creation order, but their text is not: TRF10000 sorts
 * between TRF1000 and TRF1001. Sorting by the number therefore sorts by creation time, with the
 * number breaking ties.
 */
export function getDocumentOrderBy<Field extends string>(
  query: { sortBy?: Field; sortOrder?: SortOrder },
  numberField: Field,
  defaultField: Field,
): { [field: string]: SortOrder }[] {
  if (query.sortBy !== numberField) {
    return getOrderBy(query, defaultField);
  }

  const order = query.sortOrder ?? 'desc';

  return [{ createdAt: order }, { [numberField]: order }];
}
