import { describe, expect, test } from 'vitest';
import { getDocumentOrderBy, getOrderBy, getPageMeta, getPagination } from './pagination';

describe('pagination helpers', () => {
  test('getPagination defaults to page 1 of 20', () => {
    expect(getPagination({})).toEqual({ limit: 20, page: 1 });
    expect(getPagination({ limit: 5, page: 3 })).toEqual({ limit: 5, page: 3 });
  });

  test('getPageMeta rounds the page count up', () => {
    expect(getPageMeta(2, 20, 41)).toEqual({ limit: 20, page: 2, total: 41, totalPages: 3 });
    expect(getPageMeta(1, 20, 0)).toEqual({ limit: 20, page: 1, total: 0, totalPages: 0 });
  });

  test('getOrderBy sorts by the requested field, else the defaults', () => {
    type Field = 'createdAt' | 'displayOrder';
    const query = (sortBy?: Field, sortOrder?: 'asc' | 'desc') => ({ sortBy, sortOrder });

    expect(getOrderBy(query(), 'createdAt')).toEqual({ createdAt: 'desc' });
    expect(getOrderBy(query(), 'displayOrder', 'asc')).toEqual({ displayOrder: 'asc' });
    expect(getOrderBy(query('displayOrder', 'asc'), 'createdAt')).toEqual({ displayOrder: 'asc' });
    expect(getOrderBy(query(undefined, 'asc'), 'createdAt')).toEqual({ createdAt: 'asc' });
  });

  test('getDocumentOrderBy sorts a document number by creation, then the number', () => {
    type Field = 'createdAt' | 'status' | 'transferNumber';
    const query = (sortBy?: Field, sortOrder?: 'asc' | 'desc') => ({ sortBy, sortOrder });
    const orderBy = (sortBy?: Field, sortOrder?: 'asc' | 'desc') =>
      getDocumentOrderBy(query(sortBy, sortOrder), 'transferNumber', 'createdAt');

    expect(orderBy('transferNumber', 'asc')).toEqual([
      { createdAt: 'asc' },
      { transferNumber: 'asc' },
    ]);
    expect(orderBy('transferNumber')).toEqual([{ createdAt: 'desc' }, { transferNumber: 'desc' }]);
    // Any other sort is exactly getOrderBy's.
    expect(orderBy()).toEqual({ createdAt: 'desc' });
    expect(orderBy('status', 'asc')).toEqual({ status: 'asc' });
  });
});
