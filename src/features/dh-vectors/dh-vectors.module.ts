import { Module } from '@nestjs/common';
import { QdrantClient, QdrantClientParams } from '@qdrant/js-client-rest';
import { DhVectorsController } from './dh-vectors.controller';
import { DhVectorsService } from './dh-vectors.service';

@Module({
	controllers: [DhVectorsController],
	providers: [
		{
			provide: 'QDRANT_CLIENT',
			useFactory: () => {
				const qdrantOptions: QdrantClientParams = {};
				let url = process.env.QDRANT_URL!;

				if (!process.env.QDRANT_API_KEY) {
					qdrantOptions.host = process.env.QDRANT_HOST!;
					qdrantOptions.port = Number.parseInt(url);
				} else {
					qdrantOptions.url = url;
					qdrantOptions.apiKey = process.env.QDRANT_API_KEY!;
				}
				return new QdrantClient({
					...qdrantOptions,
				});
			},
		},
		DhVectorsService,
	],
	exports: [DhVectorsService],
})
export class DhVectorsModule {}
