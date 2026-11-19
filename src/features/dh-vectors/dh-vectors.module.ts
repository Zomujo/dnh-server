import { Module } from '@nestjs/common';
import { QdrantClient, QdrantClientParams } from '@qdrant/js-client-rest';
import { isQdrantConfigured } from '@/common/utils/ai-features';
// import { DhVectorsController } from './dh-vectors.controller';
import { DhVectorsService, QDRANT_CLIENT } from './dh-vectors.service';

/** Per-request limit, so a hung Qdrant can't stall the writes that index. */
const QDRANT_REQUEST_TIMEOUT_MS = 15_000;

@Module({
	// controllers: [DhVectorsController],
	providers: [
		{
			provide: QDRANT_CLIENT,
			// null when Qdrant isn't configured; the service then turns every
			// operation into a no-op. Built even without Gemini, so vectors
			// stored earlier can still be erased.
			useFactory: (): QdrantClient | null => {
				if (!isQdrantConfigured()) return null;

				const qdrantOptions: QdrantClientParams = {};
				const url = process.env.QDRANT_URL!;

				if (process.env.QDRANT_API_KEY) {
					qdrantOptions.url = url;
					qdrantOptions.apiKey = process.env.QDRANT_API_KEY;
				} else if (url.includes('://')) {
					qdrantOptions.url = url;
				} else {
					// Legacy local setup: QDRANT_HOST plus the port in QDRANT_URL.
					qdrantOptions.host = process.env.QDRANT_HOST || 'localhost';
					qdrantOptions.port = Number.parseInt(url);
				}
				return new QdrantClient({
					...qdrantOptions,
					timeout: QDRANT_REQUEST_TIMEOUT_MS,
					checkCompatibility: false,
				});
			},
		},
		DhVectorsService,
	],
	exports: [DhVectorsService],
})
export class DhVectorsModule {}
