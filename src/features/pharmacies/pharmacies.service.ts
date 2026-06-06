import { Injectable } from '@nestjs/common';
import { DoctorsService } from '../doctors/doctors.service';
import { getDateRangeFilter } from '../vital-histories/dto';
import { VitalHistoriesService } from '../vital-histories/vital-histories.service';
import { QueryPharmacyAnalyticsDto } from './dto';

@Injectable()
export class PharmaciesService {
	constructor(
		private vitalHistoriesService: VitalHistoriesService,
		private readonly doctorsService: DoctorsService,
	) {}

	async fetchAnalytics(query: QueryPharmacyAnalyticsDto, personnelId: string) {
		let dates: Record<string, any> = {};
		const dateRange = getDateRangeFilter(query.dateRange);
		if (dateRange) {
			dates = dateRange.timestamp;
		}

		const output = await this.vitalHistoriesService.fetchAnalytics({
			personnelId,
			timestamp: dates,
		});

		return { ...output };
	}

	async fetchReferralCode(personnelId: string) {
		return this.doctorsService.fetchReferralCode(personnelId);
	}
}
