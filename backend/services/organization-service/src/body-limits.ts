type ParsedRequest = Readonly<{
  headers: { 'content-type'?: string };
  method?: string;
  url?: string;
}>;

export const isJson = (req: ParsedRequest) => /\bjson\b/i.test(req.headers['content-type'] ?? '');

/**
 * POST <prefix>/api/v1/{items,employees,restaurant-menus}/import, and the ERP's GRNs. Judged on
 * the path alone: matching the whole URL let `?x=/api/v1/erp/grns` give any route 2 MB.
 */
export const isImport = (req: ParsedRequest) =>
  req.method === 'POST' &&
  /\/api\/v1\/(?:(?:items|employees|restaurant-menus)\/import|erp\/grns)\/?$/.test(
    (req.url ?? '').split(/[?#]/, 1)[0] ?? '',
  );
