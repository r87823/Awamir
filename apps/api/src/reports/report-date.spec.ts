import { BadRequestException } from '@nestjs/common';
import { normalizeReportDateRange } from './report-date';

describe('normalizeReportDateRange', () => {
  it('defaults to the last seven days', () => {
    const now = new Date('2026-05-16T12:00:00.000Z');

    const range = normalizeReportDateRange({}, now);

    expect(range.from.toISOString()).toBe('2026-05-09T12:00:00.000Z');
    expect(range.to).toBe(now);
  });

  it('parses date-only ranges inclusively', () => {
    const range = normalizeReportDateRange({
      dateFrom: '2026-05-01',
      dateTo: '2026-05-02',
    });

    expect(range.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-05-02T23:59:59.999Z');
  });

  it('rejects invalid and too-large ranges', () => {
    expect(() => normalizeReportDateRange({ dateFrom: 'bad-date' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizeReportDateRange({
        dateFrom: '2026-01-01',
        dateTo: '2026-05-01',
      }),
    ).toThrow(BadRequestException);
  });
});
