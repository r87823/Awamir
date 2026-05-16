import { BadRequestException } from '@nestjs/common';
import { ReportRange } from './reports.types';

const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
const defaultRangeMs = 7 * 24 * 60 * 60 * 1000;

export type NormalizedReportDateRange = {
  from: Date;
  to: Date;
  response: ReportRange;
};

export function normalizeReportDateRange(
  input: { dateFrom?: string; dateTo?: string },
  now = new Date(),
): NormalizedReportDateRange {
  const to = input.dateTo ? parseDate(input.dateTo, true) : now;
  const from = input.dateFrom
    ? parseDate(input.dateFrom, false)
    : new Date(to.getTime() - defaultRangeMs);

  if (from.getTime() > to.getTime()) {
    throw invalidRange('dateFrom must be before dateTo');
  }

  if (to.getTime() - from.getTime() > maxRangeMs) {
    throw invalidRange('Report date range cannot exceed 90 days');
  }

  return {
    from,
    to,
    response: {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
    },
  };
}

function parseDate(value: string, endOfDay: boolean) {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw invalidRange('dateFrom and dateTo must be valid ISO dates');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  return new Date(value);
}

function invalidRange(message: string) {
  return new BadRequestException({
    code: 'INVALID_REPORT_DATE_RANGE',
    message,
  });
}
