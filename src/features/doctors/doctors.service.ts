import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueryPharmacyAnalyticsDto } from '../pharmacies/dto';
import { getDateRangeFilter } from '../vital-histories/dto';
import { VitalHistoriesService } from '../vital-histories/vital-histories.service';
import { Personnel } from './entities/personnel.entity';

@Injectable()
export class DoctorsService {
	constructor(
		private vitalHistoriesService: VitalHistoriesService,
		@InjectModel(Personnel.name) private personnelModel: Model<Personnel>,
	) {}

	async fetchAnalytics(query: QueryPharmacyAnalyticsDto, personnelId: string) {
		let dates: Record<string, any> = {};
		const dateRange = getDateRangeFilter(query.dateRange);
		if (dateRange) {
			dates = dateRange.timestamp;
		}

		console.log('query', dates);
		const output = await this.vitalHistoriesService.fetchAnalytics({
			personnelId,
			timestamp: dates,
		});

		return { ...output };
	}

	async findPersonnelById(personnelId: string, projection?: string) {
		const objectId = new Types.ObjectId(personnelId);
		return this.personnelModel.findById(objectId).select(projection || '');
	}

	async fetchReferralCode(personnelId: string) {
		const personnel = await this.personnelModel
			.findById(personnelId)
			.select('referralCode');

		if (!personnel) {
			throw new NotFoundException('Personnel not found');
		}

		return personnel.referralCode;
	}
}
