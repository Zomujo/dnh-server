import {
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { AuthService } from '@/core/auth/auth.service';
import { GoogleLoginDto } from '@/core/auth/dto';
import { UserType } from '@/core/auth/enums';
import { Personnel } from '../entities/personnel.entity';
import {
	CreatePersonnelDto,
	LoginPersonnelDto,
	PersonnelProviders,
	PersonnelRoles,
} from './dto';

@Injectable()
export class ChronicCareAuthService {
	constructor(
		@InjectModel(Personnel.name) private personnelModel: Model<Personnel>,
		private authService: AuthService,
	) {}

	async create(dto: CreatePersonnelDto) {
		dto.role = dto.role ?? PersonnelRoles.PHARMACY;
		const personnel = await this.personnelModel.create(dto as any);
		return personnel._id;
	}

	async login(dto: LoginPersonnelDto) {
		const orQuery: object[] = [{ userName: dto.userName }];

		if (dto.providerUserId) {
			orQuery.push({ providerUserId: dto.providerUserId });
		}

		const personnel = await this.personnelModel.findOne({ $or: orQuery });
		if (!personnel) {
			throw new NotFoundException('Personnel not found. Invalid credentials');
		}
		const passwordMatch = await bcrypt.compare(
			dto.password,
			personnel.password,
		);
		if (!passwordMatch) {
			throw new UnauthorizedException('Incorrect Password');
		}
		const token = await this.authService.signToken(
			personnel._id.toString(),
			{
				audience: UserType.CHRONIC_CARE.toString(),
			},
			{ role: personnel.role as PersonnelRoles },
		);

		return token;
	}

	async googleAuth(dto: GoogleLoginDto) {
		const payload = await this.authService.googleLogin(dto.idToken);
		const { email, sub: googleId, name } = payload;

		try {
			let personnelToken = await this.login({
				userName: name!,
				providerUserId: googleId,
				password: email || googleId,
			});
			return personnelToken;
		} catch (error) {
			if (
				error instanceof UnauthorizedException ||
				error instanceof NotFoundException
			) {
				const personnelId = await this.create({
					email,
					provider: PersonnelProviders.GOOGLE,
					role: PersonnelRoles.CLINICIAN,
					providerUserId: googleId,
					userName: name ?? email ?? googleId,
					password: email || googleId,
				});
				const token = await this.authService.signToken(
					personnelId.toString(),
					{
						audience: UserType.CHRONIC_CARE.toString(),
					},
					{ role: PersonnelRoles.CLINICIAN },
				);

				return token;
			}
			throw error;
		}
	}

	async findAuthenticated(id: string) {
		const personnel = await this.personnelModel
			.findById(id)
			.select('-password');
		if (!personnel) {
			throw new NotFoundException('Personnel not found');
		}
		return personnel;
	}
}
