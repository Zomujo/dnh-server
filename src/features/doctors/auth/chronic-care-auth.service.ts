import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ThrottlerException } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { isValidObjectId, Model } from 'mongoose';
import { AuthService } from '@/core/auth/auth.service';
import { GoogleLoginDto } from '@/core/auth/dto';
import { UserType } from '@/core/auth/enums';
import { AttemptLimit, AttemptLimiter } from '@/core/caching/attempt-limiter';
import { CommunicationsService } from '@/core/communications/communications.service';
import { GenerateOtpDto, VerifyOtpDto } from '@/core/security/otp/dto';
import { OtpService } from '@/core/security/otp/otp.service';
import { AppointmentStatus } from '@/features/appointments/dto';
import { Appointment } from '@/features/appointments/entities/appointment.entity';
import { FacilitiesService } from '@/features/facilities/facilities.service';
import { Patient } from '@/features/patients/entities/patient.entity';
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

/**
 * Email/password sign-ins allowed per email in the window; a correct one
 * resets the count, so in practice this limits wrong passwords. Counted per
 * email, not per IP, so spreading guesses across addresses does not help.
 * Someone could lock a known staff email on purpose; it unlocks on its own,
 * and Google sign-in is unaffected.
 */
export const LOGIN_ATTEMPT_LIMIT: AttemptLimit = {
	name: 'login-attempt',
	max: 5,
	windowMs: 15 * 60 * 1000,
	blockMs: 15 * 60 * 1000,
};

// Whether a personnel has been through onboarding, after which their profile
// only changes with their own token. Profiles onboarded before onboardedAt
// existed are recognised by the name onboarding set.
function isOnboarded(personnel: { onboardedAt?: Date; userName?: string }) {
	return !!personnel.onboardedAt || !!personnel.userName?.trim();
}

/** Mongo filter matching what isOnboarded() treats as not onboarded. */
const NOT_ONBOARDED = {
	onboardedAt: null,
	userName: { $not: /\S/ },
};

// Appointments in these states still need a host. Only the host can modify an
// appointment, so deleting the host would strand them — deletion is refused
// until they're completed, cancelled, or handed off.
const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = [
	AppointmentStatus.SCHEDULED,
	AppointmentStatus.RESCHEDULED,
	AppointmentStatus.ACTIVE,
];

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
		@InjectModel(Appointment.name)
		private appointmentModel: Model<Appointment>,
		@InjectModel(Patient.name) private patientModel: Model<Patient>,
		private authService: AuthService,
		private readonly otpService: OtpService,
		private readonly communicationsService: CommunicationsService,
		private readonly facilitiesService: FacilitiesService,
		private readonly attemptLimiter: AttemptLimiter,
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

		if (personnelId) {
			// Never attach a new credential to someone else's personnel: signing
			// up with a Google user's email would otherwise add a password of the
			// caller's choosing to that user's profile.
			throw new ConflictException('Account with this email already exists');
		}

		personnelId = (
			await this.personnelModel.create({ role: PersonnelRoles.CLINICIAN })
		)._id;

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

	/**
	 * Sets the personnel's profile, role and facility.
	 *
	 * The route is public because a new email account onboards before it can
	 * log in (onboarding sends the OTP). So only the first onboarding may come
	 * without a token; once a profile is onboarded, changing it needs that
	 * personnel's own token (`actorPersonnelId`). Without this, anyone who knew
	 * a personnel id could rewrite their role, name and facility.
	 */
	async onboard(dto: CreatePersonnelDto, actorPersonnelId?: string) {
		// findByIdAndUpdate/exists/countDocuments all silently collapse an
		// undefined/malformed _id filter to {} and match an arbitrary document —
		// verified against this project's mongoose version. Guard before any query.
		if (!dto.personnelId || !isValidObjectId(dto.personnelId)) {
			throw new NotFoundException('Personnel not found');
		}

		if (
			actorPersonnelId !== undefined &&
			actorPersonnelId !== dto.personnelId
		) {
			throw new ForbiddenException('You can only onboard your own account');
		}

		const existing = await this.personnelModel
			.findById(dto.personnelId)
			.select('onboardedAt userName')
			.lean();
		if (!existing) {
			throw new NotFoundException('Personnel not found');
		}

		const tokenless = actorPersonnelId === undefined;
		if (tokenless) {
			if (isOnboarded(existing)) {
				throw new UnauthorizedException(
					'This profile is already onboarded; sign in to change it',
				);
			}
			// Tokenless onboarding is for a new email signup, verified or not
			// (the app may verify the OTP first). A Google account, or an exempt
			// one that can already log in, has a token and must use it.
			const canLogIn = await this.personnelAccountModel.exists({
				personnel: existing._id,
				$or: [
					{ provider: { $ne: PersonnelProviders.EMAIL } },
					{
						verificationStatus: PersonnelAccountVerificationStatus.EXEMPT,
					},
				],
			});
			if (canLogIn) {
				throw new UnauthorizedException('Sign in to onboard this account');
			}
		}

		if (dto.facility) {
			// Throws NotFoundException for a nonexistent/fabricated facility id.
			await this.facilitiesService.findOne(dto.facility);
		}

		const personnel = await this.personnelModel
			.findOneAndUpdate(
				// Without a token, the not-onboarded check is part of the write, so
				// two concurrent tokenless calls cannot both succeed.
				tokenless
					? { _id: dto.personnelId, ...NOT_ONBOARDED }
					: { _id: dto.personnelId },
				{
					$set: {
						userName: `${dto.firstname ?? ''} ${dto.lastname ?? ''}`.trim(),
						phoneNumber: dto.phoneNumber,
						personnelIdNumber: dto.personnelIdNumber,
						facility: dto.facility,
						...(dto.role !== undefined && { role: dto.role }),
						onboardedAt: existing.onboardedAt ?? new Date(),
					},
				},
				{ new: true },
			)
			.populate({ path: 'personnelAccounts' });

		if (!personnel) {
			// It existed a moment ago, so a concurrent tokenless onboarding won.
			throw new UnauthorizedException(
				'This profile is already onboarded; sign in to change it',
			);
		}

		const account = (personnel.personnelAccounts as any)?.[0] as
			| PersonnelAccount
			| undefined;

		if (
			account &&
			account.verificationStatus !== PersonnelAccountVerificationStatus.VERIFIED
		) {
			if (OTP_REQUIRED_ROLES.includes(personnel.role as PersonnelRoles)) {
				// The profile is already saved, so a send limit reached through
				// re-send must not fail onboarding; a code sent earlier still works.
				const code = await this.otpService
					.generate({ identifier: `${account.email}` })
					.catch((error) => {
						if (error instanceof ThrottlerException) return undefined;
						throw error;
					});

				if (code !== undefined) {
					this.sendVerificationCodeMail({
						mail: account.email,
						fullName: personnel.userName,
						code: code,
					});
				}
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

		if (!isGoogleLogin) {
			// Counted before the password is checked, whether or not the email
			// has an account, so the limit caps how many guesses are tried.
			await this.attemptLimiter.consume(LOGIN_ATTEMPT_LIMIT, dto.email);
		}

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
			await this.attemptLimiter.reset(LOGIN_ATTEMPT_LIMIT, dto.email);
		}

		const personnel = personnelAccount.personnel as any;
		if (!personnel) {
			// The account row outlived its personnel (deleted account). On the
			// Google path, NotFound lets googleAuth() re-register through create(),
			// which drops the orphaned row — same as email re-registration.
			if (isGoogleLogin) {
				throw new NotFoundException('Personnel not found');
			}
			throw new UnauthorizedException('This account has been deleted');
		}

		// EXEMPT only waives the OTP for roles that don't need one. A role that
		// does (e.g. an EXEMPT pharmacy account re-onboarded as clinician) must
		// prove the email first, or onboarding could skip verification.
		if (
			OTP_REQUIRED_ROLES.includes(personnel.role as PersonnelRoles) &&
			personnelAccount.verificationStatus !==
				PersonnelAccountVerificationStatus.VERIFIED
		) {
			throw new UnauthorizedException('Personnel not verified');
		}

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

		const openAppointments = await this.appointmentModel.countDocuments({
			hostPersonnel: personnel._id,
			status: { $in: OPEN_APPOINTMENT_STATUSES },
		});
		if (openAppointments > 0) {
			throw new ConflictException(
				`Cannot delete account with ${openAppointments} upcoming appointment(s). Complete, cancel, or reassign them first.`,
			);
		}

		// Accounts are linked both ways (account.personnel and
		// personnel.personnelAccounts) — clear rows reachable from either side
		// before the personnel, so a partial failure never leaves a loginable
		// account pointing at a missing personnel.
		await this.personnelAccountModel.deleteMany({
			$or: [
				{ personnel: personnel._id },
				{ _id: { $in: (personnel.personnelAccounts as any) ?? [] } },
			],
		});
		await this.personnelModel.findByIdAndDelete(personnelId);
		await this.authService.revokePersonnelTokens(personnelId);

		// Clinical records (appointments, vitals, createdBy) are kept for
		// provenance; only the patient-relationship lists are pruned.
		// Visited lists are typed as populated Personnel docs; cast the raw id.
		const personnelRef = personnel._id as any;
		await this.patientModel.updateMany(
			{
				$or: [
					{ doctorsVisited: personnelRef },
					{ pharmaciesVisited: personnelRef },
				],
			},
			{
				$pull: {
					doctorsVisited: personnelRef,
					pharmaciesVisited: personnelRef,
				},
			},
		);
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
	}) {
		// Email only: this code proves the email address. The phone number comes
		// from the unauthenticated onboarding request, so an SMS copy would let
		// anyone verify an email they do not own.
		const { mail, fullName, code } = payload;
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
	}
}
