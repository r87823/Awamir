export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PaginationInput = {
  page?: number | string;
  pageSize?: number | string;
};

export type NormalizedPagination = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export function normalizePagination(
  input: PaginationInput = {},
): NormalizedPagination {
  const page = clampInteger(input.page, DEFAULT_PAGE, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInteger(
    input.pageSize,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

function clampInteger(
  value: number | string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed as number), 1), max);
}
