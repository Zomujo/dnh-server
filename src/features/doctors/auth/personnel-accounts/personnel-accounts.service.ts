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

	// Every lookup is scoped to the caller's personnel so one clinician can
	// never read, change, or delete another's login.
	async findOne(id: string, personnelId: string) {
		const account = await this.personnelAccountModel
			.findOne({ _id: id, personnel: personnelId })
			.populate({ path: 'personnel', select: 'userName role' });

		if (!account) throw new NotFoundException('Personnel account not found');
		return account;
	}

	async update(
		id: string,
		personnelId: string,
		dto: UpdatePersonnelAccountDto,
	) {
		const account = await this.personnelAccountModel.findOne({
			_id: id,
			personnel: personnelId,
		});
		if (!account) throw new NotFoundException('Personnel account not found');

		// Ownership and provider identity are fixed at creation; re-pointing
		// them would let an account be moved to another personnel.
		const { personnel, provider, providerUserId, ...changes } = dto;
		account.set(changes);
		// save() rather than findByIdAndUpdate so the pre-save hook hashes
		// a changed password instead of storing it in plaintext.
		await account.save();
		return account._id.toString();
	}

	async remove(id: string, personnelId: string) {
		const account = await this.personnelAccountModel.findOne({
			_id: id,
			personnel: personnelId,
		});
		if (!account) throw new NotFoundException('Personnel account not found');

		const accountCount = await this.personnelAccountModel.countDocuments({
			personnel: personnelId,
		});
		if (accountCount <= 1) {
			// Removing the only login would strand the personnel record —
			// full account deletion goes through DELETE /personnel/auth.
			throw new ConflictException(
				'Cannot remove the only login method on this account',
			);
		}

		await account.deleteOne();
		await this.personnelAccountModel.db
			.collection('personnels')
			.updateOne(
				{ _id: new ObjectId(personnelId) },
				{ $pull: { personnelAccounts: account._id } as any },
			);
		return account;
	}
}
