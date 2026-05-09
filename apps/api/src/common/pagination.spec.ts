import { normalizePagination } from './pagination';

describe('normalizePagination', () => {
  it('normalizes defaults and computes skip/take', () => {
    expect(normalizePagination()).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
    });
  });

  it('clamps invalid and oversized values', () => {
    expect(normalizePagination({ page: '0', pageSize: '1000' })).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
      take: 100,
    });
  });

  it('supports string query values', () => {
    expect(normalizePagination({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });
});
