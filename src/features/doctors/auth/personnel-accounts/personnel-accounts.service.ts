import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { Model } from 'mongoose';
import { generateFilter } from '@/common/factory';
import { escapeRegExp } from '@/common/utils/helpers';
import { AuthService } from '@/core/auth/auth.service';
import { GoogleLoginDto } from '@/core/auth/dto';
import { PersonnelProviders } from '../dto';
import {
	CreatePersonnelAccountDto,
	GetPersonnelAccountsQueryDto,
	UpdatePersonnelAccountDto,
} from './dto';
import { PersonnelAccount } from './entities/personnel-account.entity';

@Injectable()
export class PersonnelAccountsService {
	constructor(
		@InjectModel(PersonnelAccount.name)
		private readonly personnelAccountModel: Model<PersonnelAccount>,
		private authService: AuthService,
	) {}

	async create(dto: CreatePersonnelAccountDto) {
		const existingAccount = await this.personnelAccountModel.findOne({
			provider: dto.provider || PersonnelProviders.EMAIL,
			email: dto.email,
			personnel: new ObjectId(dto.personnel),
		});
		if (existingAccount) {
			throw new ConflictException('Account already exists');
		}

		const account = await this.personnelAccountModel.create({
			provider: dto.provider || PersonnelProviders.EMAIL,
			providerUserId: dto.providerUserId,
			email: dto.email,
			password: dto.password,
			personnel: new ObjectId(dto.personnel),
		});

		await this.personnelAccountModel.db
			.collection('personnels')
			.updateOne(
				{ _id: new ObjectId(dto.personnel) },
				{ $push: { personnelAccounts: account._id } as any },
			);

		return account._id.toString();
	}

	async googleAccountLink(dto: GoogleLoginDto, personnelId: string) {
		const payload = await this.authService.googleLogin(dto.idToken);
		const { email, sub: googleId, email_verified: isVerified } = payload;

		if (!isVerified) {
			throw new ConflictException('Email not verified');
		}

		const personnelAccountId = await this.create({
			provider: PersonnelProviders.GOOGLE,
			providerUserId: googleId,
			email: email!,
			password: email || googleId,
			personnel: personnelId,
		});

		return personnelAccountId.toString();
	}

	async findAll(personnelId: string, query: GetPersonnelAccountsQueryDto) {
		const { pageFilter } = generateFilter(query);

		const filter: Record<string, any> = { personnel: personnelId };
		if (query.search) {
			filter.email = {
				$regex: `^${escapeRegExp(query.search)}`,
				$options: 'i',
			};
		}

		const [rows, count] = await Promise.all([
			this.personnelAccountModel
				.find(filter)
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(pageFilter.orderBy)
				.populate({ path: 'personnel', select: 'userName role' }),
			this.personnelAccountModel.countDocuments(filter),
		]);

		return { rows, count };
	}

	async findOne(id: string) {
		const account = await this.personnelAccountModel
			.findById(id)
			.populate({ path: 'personnel', select: 'userName role' });

		if (!account) throw new NotFoundException('Personnel account not found');
		return account;
	}

	async update(id: string, dto: UpdatePersonnelAccountDto) {
		const account = await this.personnelAccountModel.findByIdAndUpdate(
			id,
			dto,
			{ new: true },
		);
		if (!account) throw new NotFoundException('Personnel account not found');
		return account._id.toString();
	}

	async remove(id: string) {
		const account = await this.personnelAccountModel.findByIdAndDelete(id);
		if (!account) throw new NotFoundException('Personnel account not found');
		return account;
	}
}
