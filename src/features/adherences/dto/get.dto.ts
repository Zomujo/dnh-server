import { ApiResponseProperty } from '@nestjs/swagger';

export class AdherenceItemsDto {
	@ApiResponseProperty({
		example: '68ade3724a6c3ca4b35d50e7',
	})
	id: string;

	@ApiResponseProperty({
		example: 'Metformin',
	})
	targetName: string;

	@ApiResponseProperty({
		example: 85,
	})
	adherenceRate: number;

	@ApiResponseProperty({
		example: new Date(),
	})
	lastLoggedAt: Date;

	@ApiResponseProperty({
		example: 'Patient missed dose on Monday due to travel.',
	})
	notes: string;
}

export class GetAdherencePatternDto {
	@ApiResponseProperty({
		example: 'medication',
	})
	targetType: string;

	@ApiResponseProperty({
		type: [AdherenceItemsDto],
	})
	items: AdherenceItemsDto[];
}
