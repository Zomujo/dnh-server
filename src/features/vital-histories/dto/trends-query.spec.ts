import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DateRange, getDateRangeFilter } from './create.dto';
import { resolveTrendWindow, VitalHistoryTrendsQueryDto } from './get.dto';

const errors = async (plain: object) =>
	(await validate(plainToInstance(VitalHistoryTrendsQueryDto, plain))).map(
		(e) => e.property,
	);

describe('trends query', () => {
	it('accepts a preset or a from/to pair', async () => {
		expect(
			await errors({ vitalType: 'heartRate', dateRange: 'thisWeek' }),
		).toEqual([]);
		expect(
			await errors({
				vitalType: 'heartRate',
				from: '2026-10-16T00:00:00Z',
				to: '2026-10-23T00:00:00Z',
			}),
		).toEqual([]);
	});

	it('requires a dateRange when no custom window is sent', async () => {
		expect(await errors({ vitalType: 'heartRate' })).toContain('dateRange');
	});

	it('requires both ends of a custom window', async () => {
		expect(
			await errors({ vitalType: 'heartRate', from: '2026-10-16T00:00:00Z' }),
		).toContain('to');
	});

	it('rejects an unknown time zone', async () => {
		expect(
			await errors({
				vitalType: 'heartRate',
				dateRange: 'today',
				tz: 'Mars/Olympus',
			}),
		).toContain('tz');
	});

	describe('resolveTrendWindow', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
		});
		afterEach(() => vi.useRealTimers());

		it('uses from/to as given', () => {
			const from = new Date('2026-10-01T00:00:00Z');
			const to = new Date('2026-10-02T00:00:00Z');
			expect(resolveTrendWindow({ from, to })).toEqual({
				$gte: from,
				$lte: to,
			});
		});

		it('rejects a reversed or over-long window', () => {
			expect(() =>
				resolveTrendWindow({
					from: new Date('2026-10-02'),
					to: new Date('2026-10-01'),
				}),
			).toThrow(BadRequestException);
			expect(() =>
				resolveTrendWindow({
					from: new Date('2024-01-01'),
					to: new Date('2026-01-01'),
				}),
			).toThrow(BadRequestException);
			// 366 days and ~24 h: over the limit even though whole days say 366.
			expect(() =>
				resolveTrendWindow({
					from: new Date('2025-01-01T00:00:00Z'),
					to: new Date('2026-01-02T23:59:00Z'),
				}),
			).toThrow(BadRequestException);
		});

		it('takes day boundaries in the requested time zone', () => {
			// 12:00 UTC on the 23rd is 08:00 in New York (UTC-4 in October).
			const window = resolveTrendWindow({
				dateRange: DateRange.TODAY,
				tz: 'America/New_York',
			});
			expect(window.$gte.toISOString()).toBe('2026-10-22T04:00:00.000Z');
			expect(window.$lte.toISOString()).toBe('2026-10-24T03:59:59.999Z');
		});

		it('matches the server-time preset when no zone is sent', () => {
			expect(resolveTrendWindow({ dateRange: DateRange.THIS_WEEK })).toEqual(
				getDateRangeFilter(DateRange.THIS_WEEK)?.timestamp,
			);
		});
	});
});
