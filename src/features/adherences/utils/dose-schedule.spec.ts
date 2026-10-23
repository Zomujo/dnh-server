import { Types } from 'mongoose';
import {
	adherenceRateOf,
	type DoseLog,
	doseOfLog,
	resolveDoses,
	type ScheduledMedication,
	scheduledDoses,
} from './dose-schedule';

const medication: ScheduledMedication = {
	_id: new Types.ObjectId(),
	name: 'Metformin',
	startDate: new Date('2026-06-01T08:00:00'),
	createdAt: new Date('2026-06-01T07:00:00'),
	morning: { time: { hour: 8, minutes: 0, timeDesignators: 'AM' } },
	evening: { time: { hour: 8, minutes: 0, timeDesignators: 'PM' } },
};

const log = (fields: Partial<DoseLog>): DoseLog => ({
	_id: new Types.ObjectId(),
	taken: true,
	status: 'taken',
	...fields,
});

describe('dose-schedule', () => {
	describe('scheduledDoses', () => {
		it('expects one dose per section per day, from the start day on', () => {
			const doses = scheduledDoses(
				medication,
				new Date('2026-05-31T00:00:00'),
				new Date('2026-06-02T23:59:59'),
			);

			expect(doses.map((d) => [d.scheduledFor, d.section])).toEqual([
				[new Date('2026-06-01T08:00:00'), 'morning'],
				[new Date('2026-06-01T20:00:00'), 'evening'],
				[new Date('2026-06-02T08:00:00'), 'morning'],
				[new Date('2026-06-02T20:00:00'), 'evening'],
			]);
		});

		it('skips doses scheduled before the medication was added', () => {
			const addedAt3pm = {
				...medication,
				createdAt: new Date('2026-06-01T15:00:00'),
			};

			const doses = scheduledDoses(
				addedAt3pm,
				new Date('2026-06-01T00:00:00'),
				new Date('2026-06-01T23:59:59'),
			);

			expect(doses.map((d) => d.section)).toEqual(['evening']);
		});

		it('stops after the end date', () => {
			const ended = { ...medication, endDate: new Date('2026-06-01') };

			const doses = scheduledDoses(
				ended,
				new Date('2026-06-01T00:00:00'),
				new Date('2026-06-03T00:00:00'),
			);

			expect(doses).toHaveLength(2);
		});
	});

	describe('doseOfLog', () => {
		it('uses the stored section', () => {
			const dose = doseOfLog(
				log({
					scheduledFor: new Date('2026-06-02T09:00:00'),
					section: 'evening',
				}),
				medication,
			);
			expect(dose?.section).toBe('evening');
		});

		it('matches an older log to the nearest section, after a time change', () => {
			const dose = doseOfLog(
				log({ scheduledFor: new Date('2026-06-02T09:00:00') }),
				medication,
			);
			expect(dose?.section).toBe('morning');
		});

		it('falls back to takenAt when the log has no scheduledFor', () => {
			const takenAt = new Date('2026-06-02T21:15:00');
			expect(doseOfLog(log({ takenAt }), medication)).toEqual({
				at: takenAt,
				section: 'evening',
			});
		});
	});

	describe('resolveDoses', () => {
		const from = new Date('2026-06-01T00:00:00');
		const to = new Date('2026-06-03T23:59:59');
		const now = new Date('2026-06-03T12:00:00');

		it('gives each dose a status', () => {
			const doses = resolveDoses(
				medication,
				[
					log({ scheduledFor: new Date('2026-06-01T08:00:00') }),
					log({
						scheduledFor: new Date('2026-06-01T20:00:00'),
						taken: false,
						status: 'missed',
					}),
					log({
						scheduledFor: new Date('2026-06-02T08:00:00'),
						status: 'partial',
					}),
				],
				from,
				to,
				now,
			);

			expect(doses.map((d) => d.status)).toEqual([
				'taken', // Jun 1 morning
				'missed', // Jun 1 evening, logged
				'partial', // Jun 2 morning
				'pending', // Jun 2 evening, still confirmable
				'pending', // Jun 3 morning
				'pending', // Jun 3 evening, not due yet
			]);
		});

		it('counts an unlogged dose as missed once its window closes', () => {
			const [first] = resolveDoses(
				medication,
				[],
				from,
				to,
				new Date('2026-06-03T08:00:01'),
			);
			expect(first.status).toBe('missed');
			expect(first.logId).toBeUndefined();
		});

		it("keeps a late confirm on the dose's own day", () => {
			const doses = resolveDoses(
				medication,
				[
					log({
						scheduledFor: new Date('2026-06-01T20:00:00'),
						takenAt: new Date('2026-06-02T07:30:00'),
						status: 'partial',
					}),
				],
				from,
				to,
				now,
			);

			expect(doses[1]).toMatchObject({
				scheduledFor: new Date('2026-06-01T20:00:00'),
				section: 'evening',
				status: 'partial',
			});
			// Jun 2 gains nothing from it: its morning dose is still open.
			expect(doses[2]).toMatchObject({ section: 'morning', status: 'pending' });
		});

		it('prefers a taken log over a missed one for the same dose', () => {
			const [first] = resolveDoses(
				medication,
				[
					log({
						scheduledFor: new Date('2026-06-01T08:00:00'),
						taken: false,
						status: 'missed',
					}),
					log({ takenAt: new Date('2026-06-01T08:20:00') }),
				],
				from,
				to,
				now,
			);
			expect(first.status).toBe('taken');
		});
	});

	describe('adherenceRateOf', () => {
		it('counts partial as taken and leaves pending doses out', () => {
			const at = new Date();
			expect(
				adherenceRateOf([
					{ scheduledFor: at, section: 'morning', status: 'taken' },
					{ scheduledFor: at, section: 'evening', status: 'partial' },
					{ scheduledFor: at, section: 'morning', status: 'missed' },
					{ scheduledFor: at, section: 'evening', status: 'pending' },
				]),
			).toBe(67);
		});

		it('is null before any dose has settled', () => {
			expect(
				adherenceRateOf([
					{ scheduledFor: new Date(), section: 'morning', status: 'pending' },
				]),
			).toBeNull();
		});
	});
});
