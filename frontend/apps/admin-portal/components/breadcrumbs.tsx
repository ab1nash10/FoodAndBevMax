/**
 * The breadcrumb was removed from the portal. Pages still call this to name the record they
 * show; it does nothing now.
 * ponytail: delete this file and its calls once those pages have no other work in progress.
 */
export function useBreadcrumbLabel(
  _id: string | null | undefined,
  _label: string | null | undefined,
): void {
  // Nothing reads record names any more.
}
