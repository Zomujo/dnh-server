import { mockDeep } from 'vitest-mock-extended';
import { createGeminiChatModel } from '@/common/utils/ai-features';
import { upsertAdherencePattern } from './adherence.util';
import { upsertOverallAdherencePattern } from './overview.util';

vi.mock('@/common/utils/ai-features', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/common/utils/ai-features')>()),
	createGeminiChatModel: vi.fn(),
}));

/** A model whose find(...).sort().limit().select().exec() yields `logs`. */
function modelsWith(logs: { taken: boolean }[]) {
	const query = {
		sort: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		exec: vi.fn().mockResolvedValue(logs),
	};
	const adherenceLogModel = mockDeep<any>();
	adherenceLogModel.find.mockReturnValue(query);
	const adherencePatternModel = mockDeep<any>();
	adherencePatternModel.findOneAndUpdate.mockResolvedValue({});
	return { adherenceLogModel, adherencePatternModel };
}

const log = {
	userId: 'user-1',
	patient: 'patient-1',
	targetType: 'medication',
	targetName: 'Metformin',
	takenAt: new Date('2026-11-01T08:00:00Z'),
} as any;

describe('adherence pattern hooks with the AI not configured', () => {
	beforeEach(() => {
		vi.stubEnv('GOOGLE_API_KEY', '');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('saves the medication pattern rate with empty notes', async () => {
		const { adherenceLogModel, adherencePatternModel } = modelsWith([
			{ taken: true },
			{ taken: false },
		]);

		await expect(
			upsertAdherencePattern(log, adherenceLogModel, adherencePatternModel),
		).resolves.toBeUndefined();

		expect(adherencePatternModel.findOneAndUpdate).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ adherenceRate: 50, notes: '' }),
			expect.anything(),
		);
	});

	it('saves the overview pattern rate with empty notes', async () => {
		const { adherenceLogModel, adherencePatternModel } = modelsWith([
			{ taken: true },
		]);

		await expect(
			upsertOverallAdherencePattern(
				log,
				adherenceLogModel,
				adherencePatternModel,
			),
		).resolves.toBeUndefined();

		expect(adherencePatternModel.findOneAndUpdate).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ adherenceRate: 100, notes: '' }),
			expect.anything(),
		);
	});
});

describe('adherence pattern hooks when the AI call fails', () => {
	beforeEach(() => {
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');
		vi.mocked(createGeminiChatModel).mockReturnValue({
			invoke: vi.fn().mockRejectedValue(new Error('503 from Gemini')),
		} as any);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.mocked(createGeminiChatModel).mockReset();
	});

	it('saves the rate but keeps the existing notes', async () => {
		const { adherenceLogModel, adherencePatternModel } = modelsWith([
			{ taken: true },
		]);

		await upsertAdherencePattern(log, adherenceLogModel, adherencePatternModel);
		await upsertOverallAdherencePattern(
			log,
			adherenceLogModel,
			adherencePatternModel,
		);

		for (const [, update] of adherencePatternModel.findOneAndUpdate.mock
			.calls) {
			expect(update).toMatchObject({ adherenceRate: 100 });
			expect(update).not.toHaveProperty('notes');
		}
		expect(adherencePatternModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
	});
});
