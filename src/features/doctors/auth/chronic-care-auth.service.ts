import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { isValidObjectId, Model } from 'mongoose';
import { AuthService } from '@/core/auth/auth.service';
import { GoogleLoginDto } from '@/core/auth/dto';
import { UserType } from '@/core/auth/enums';
import { CommunicationsService } from '@/core/communications/communications.service';
import { GenerateOtpDto, VerifyOtpDto } from '@/core/security/otp/dto';
import { OtpService } from '@/core/security/otp/otp.service';
import { FacilitiesService } from '@/features/facilities/facilities.service';
import { Personnel } from '../entities/personnel.entity';
import { CreatePersonnelDto, PersonnelProviders, PersonnelRoles } from './dto';
import {
	PersonnelAccount,
	PersonnelAccountVerificationStatus,
} from './personnel-accounts/entities/personnel-account.entity';

// Roles that must prove ownership of their email via OTP before they can log in.
// PHARMACY is intentionally excluded for now — product hasn't shipped an OTP entry
// screen on that side yet. Those accounts land in the EXEMPT verification state
// instead of VERIFIED, so they stay findable and can be pushed through real
// verification later just by adding PersonnelRoles.PHARMACY here.
const OTP_REQUIRED_ROLES: PersonnelRoles[] = [PersonnelRoles.CLINICIAN];

type CreatePersonnelAccountInput = {
	email: string;
	password?: string;
	provider?: PersonnelProviders;
	providerUserId?: string;
	role?: PersonnelRoles;
};

type LoginInput = {
	email: string;
	password?: string;
	providerUserId?: string;
};

@Injectable()
export class ChronicCareAuthService {
	constructor(
		@InjectModel(Personnel.name) private personnelModel: Model<Personnel>,
		@InjectModel(PersonnelAccount.name)
		private personnelAccountModel: Model<PersonnelAccount>,
		private authService: AuthService,
		private readonly otpService: OtpService,
		private readonly communicationsService: CommunicationsService,
		private readonly facilitiesService: FacilitiesService,
	) {}

	async create(dto: CreatePersonnelAccountInput) {
		const existingAccount = await this.personnelAccountModel.findOne({
			email: dto.email,
		});

		let personnelId: any = existingAccount?.personnel;

		if (
			personnelId &&
			!(await this.personnelModel.exists({ _id: personnelId }))
		) {
			// The account row outlived its personnel (e.g. deleted via
			// DELETE /personnel/auth without this row being cleaned up).
			// Drop the orphaned row instead of resurrecting the dead id.
			await this.personnelAccountModel.deleteOne({ _id: existingAccount!._id });
			personnelId = undefined;
		}

		if (!personnelId) {
			const personnel = await this.personnelModel.create({
				role: PersonnelRoles.CLINICIAN,
			});
			personnelId = personnel._id;
		}

		const provider = dto.provider || PersonnelProviders.EMAIL;

		const personnelAccount = await this.personnelAccountModel.create({
			provider,
			providerUserId: dto.providerUserId,
			email: dto.email,
			...(dto.password && { password: dto.password }),
			personnel: personnelId,
			// Google already vouches for the email via its own OAuth verification
			// (checked before this is ever called) — no OTP round trip needed.
			verificationStatus:
				provider === PersonnelProviders.GOOGLE
					? PersonnelAccountVerificationStatus.VERIFIED
					: PersonnelAccountVerificationStatus.UNVERIFIED,
		});

		await this.personnelModel.findByIdAndUpdate(personnelId, {
			$push: { personnelAccounts: personnelAccount._id },
		});

		return personnelId;
	}

	async onboard(dto: CreatePersonnelDto) {
		// findByIdAndUpdate/exists/countDocuments all silently collapse an
		// undefined/malformed _id filter to {} and match an arbitrary document —
		// verified against this project's mongoose version. Guard before any query.
		if (!dto.personnelId || !isValidObjectId(dto.personnelId)) {
			throw new NotFoundException('Personnel not found');
		}

		const personnelExists = await this.personnelModel.exists({
			_id: dto.personnelId,
		});
		if (!personnelExists) {
			throw new NotFoundException('Personnel not found');
		}

		if (dto.facility) {
			// Throws NotFoundException for a nonexistent/fabricated facility id.
			await this.facilitiesService.findOne(dto.facility);
		}

		const personnel = await this.personnelModel
			.findByIdAndUpdate(
				dto.personnelId,
				{
					$set: {
						userName: `${dto.firstname ?? ''} ${dto.lastname ?? ''}`.trim(),
						phoneNumber: dto.phoneNumber,
						personnelIdNumber: dto.personnelIdNumber,
						facility: dto.facility,
						...(dto.role !== undefined && { role: dto.role }),
					},
				},
				{ new: true },
			)
			.populate({ path: 'personnelAccounts' });

		if (!personnel) {
			throw new NotFoundException('Personnel not found');
		}

		const account = (personnel.personnelAccounts as any)?.[0] as
			| PersonnelAccount
			| undefined;

		if (
			account &&
			account.verificationStatus !== PersonnelAccountVerificationStatus.VERIFIED
		) {
			if (OTP_REQUIRED_ROLES.includes(personnel.role as PersonnelRoles)) {
				const code = await this.otpService.generate({
					identifier: `${account.email}`,
				});

				this.sendVerificationCodeMail({
					mail: account.email,
					fullName: personnel.userName,
					code: code,
					phoneNumber: personnel.phoneNumber,
				});
			} else {
				account.verificationStatus = PersonnelAccountVerificationStatus.EXEMPT;
				await (account as any).save();
			}
		}

		return personnel?._id;
	}

	async login(dto: LoginInput) {
		// Google and email/password are separate credentials on separate
		// PersonnelAccount rows, even when they share an email — never
		// disambiguate by email alone (see 2.4 in the audit).
		const isGoogleLogin = !!dto.providerUserId;

		const personnelAccount = await this.personnelAccountModel
			.findOne(
				isGoogleLogin
					? {
							provider: PersonnelProviders.GOOGLE,
							providerUserId: dto.providerUserId,
						}
					: { provider: PersonnelProviders.EMAIL, email: dto.email },
			)
			.populate({
				path: 'personnel',
				select: 'role facility',
			});

		if (!personnelAccount) {
			if (isGoogleLogin) {
				// Signals "no Google account yet" to googleAuth(), which decides
				// separately whether to create one.
				throw new NotFoundException('Personnel not found');
			}
			throw new UnauthorizedException('Invalid credentials');
		}

		if (
			personnelAccount.verificationStatus ===
			PersonnelAccountVerificationStatus.UNVERIFIED
		) {
			throw new UnauthorizedException('Personnel not verified');
		}

		if (!isGoogleLogin) {
			// The Google ID token (already verified via authService.googleLogin)
			// is the credential on that path — no password was ever set for it.
			const passwordMatch = await bcrypt.compare(
				dto.password ?? '',
				personnelAccount.password ?? '',
			);
			if (!passwordMatch) {
				throw new UnauthorizedException('Invalid credentials');
			}
		}

		const personnel = personnelAccount.personnel as any;
		const token = await this.authService.signToken(
			personnel._id.toString(),
			{
				audience: UserType.CHRONIC_CARE.toString(),
			},
			{
				role: personnel.role as PersonnelRoles,
				email: personnelAccount.email,
				facility: personnel.facility?.toString(),
			},
		);

		return { personnelId: personnel._id.toString(), token };
	}

	async googleAuth(dto: GoogleLoginDto) {
		const payload = await this.authService.googleLogin(dto.idToken);
		const { email, sub: googleId, email_verified: emailVerified } = payload;
		if (!emailVerified) {
			throw new ConflictException('Email not verified');
		}
		try {
			return await this.login({
				email: email!,
				providerUserId: googleId,
			});
		} catch (error) {
			if (error instanceof NotFoundException) {
				const existingEmailAccount = await this.personnelAccountModel.findOne({
					email,
					provider: PersonnelProviders.EMAIL,
				});
				if (existingEmailAccount) {
					throw new ConflictException('Account with this email already exists');
				}

				const personnelId = await this.create({
					email: email!,
					provider: PersonnelProviders.GOOGLE,
					role: PersonnelRoles.CLINICIAN,
					providerUserId: googleId,
				});
				const token = await this.authService.signToken(
					personnelId.toString(),
					{
						audience: UserType.CHRONIC_CARE.toString(),
					},
					{
						role: PersonnelRoles.CLINICIAN,
						email: email!,
					},
				);

				return { personnelId: personnelId.toString(), token };
			}
			throw error;
		}
	}

	async deletePersonnel(personnelId: string): Promise<void> {
		const personnel = await this.personnelModel.findById(personnelId);
		if (!personnel) {
			throw new NotFoundException('Personnel not found');
		}
		await this.personnelAccountModel.deleteMany({ personnel: personnelId });
		await this.personnelModel.findByIdAndDelete(personnelId);
	}

	async findAuthenticated(id: string) {
		const personnel = await this.personnelModel
			.findById(id)
			.select('-password')
			.populate({ path: 'facility', select: 'name' });
		if (!personnel) {
			throw new NotFoundException('Personnel not found');
		}
		const json = personnel.toJSON() as any;
		json.assignedPatientsCount = 0;
		return json;
	}

	// OTP verifies ownership of one specific email/password account, not the
	// personnel as a whole — a personnel could also hold an already-verified
	// Google account. Only ever resolves the EMAIL-provider account, since
	// that's the only kind OTP applies to.
	private async resolveOtpAccount(identifier: string) {
		let account = await this.personnelAccountModel
			.findOne({ email: identifier, provider: PersonnelProviders.EMAIL })
			.populate({ path: 'personnel' });

		if (!account) {
			const personnel = await this.personnelModel.findOne({
				phoneNumber: identifier,
			});
			if (personnel) {
				account = await this.personnelAccountModel
					.findOne({
						personnel: personnel._id,
						provider: PersonnelProviders.EMAIL,
					})
					.populate({ path: 'personnel' });
			}
		}

		return account;
	}

	async sendOnboardOtp(dto: GenerateOtpDto) {
		const account = await this.resolveOtpAccount(dto.identifier);

		if (!account) {
			throw new NotFoundException('Personnel not found');
		}

		if (
			account.verificationStatus === PersonnelAccountVerificationStatus.VERIFIED
		) {
			throw new BadRequestException('Personnel already verified');
		}

		const personnel = account.personnel as any;
		const code = await this.otpService.generate({
			identifier: `${account.email}`,
		});

		this.sendVerificationCodeMail({
			mail: account.email,
			fullName: personnel?.userName,
			code: code,
			phoneNumber: personnel?.phoneNumber,
		});
	}

	async verifyOnboardOtp(dto: VerifyOtpDto) {
		const account = await this.resolveOtpAccount(dto.identifier);

		if (!account) {
			throw new NotFoundException('Personnel not found');
		}

		const isValid = await this.otpService.verify({
			identifier: account.email,
			code: dto.code,
		});

		if (!isValid) {
			throw new BadRequestException('Invalid or expired OTP');
		}

		account.verificationStatus = PersonnelAccountVerificationStatus.VERIFIED;
		await (account as any).save();
	}

	private sendVerificationCodeMail(payload: {
		mail: string;
		fullName: string;
		code: number;
		phoneNumber?: string;
	}) {
		const { mail, fullName, code, phoneNumber } = payload;
		const emailPayload = {
			recipient: mail,
			subject: 'Email OTP - Yelima',
			template: './emailVerificationCode',
			context: {
				fullName,
				code,
				email: mail,
				ttl: '10 minutes',
			},
		};

		this.communicationsService.sendMail(emailPayload);

		if (phoneNumber) {
			this.communicationsService.sendSms({
				recipient: [phoneNumber],
				message: `Hi ${fullName}, your OTP is ${code}. It is valid for 10 minutes.`,
			});
		}
	}
}
