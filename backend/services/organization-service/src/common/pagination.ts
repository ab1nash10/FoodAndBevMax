import type { PaginationQueryDto } from './dto/pagination-query.dto';

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
