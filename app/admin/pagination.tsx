import Link from "next/link";

/** Prev / next links that keep the current filters. */
export function Pagination({ page, pages, total, label, params, basePath }: {
  page: number;
  pages: number;
  total: number;
  label: string;
  params: Record<string, string>;
  basePath: string;
}) {
  const href = (target: number) => {
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, value]) => value)), ...(target > 1 ? { page: String(target) } : {}) });
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>{total} {label}{pages > 1 ? ` · page ${page} of ${pages}` : ""}</p>
      {pages > 1 && (
        <div className="flex gap-2">
          {page > 1 ? <Link className="btn-ghost border border-line" href={href(page - 1)}>← Previous</Link> : null}
          {page < pages ? <Link className="btn-ghost border border-line" href={href(page + 1)}>Next →</Link> : null}
        </div>
      )}
    </nav>
  );
}
