import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { ThrottlerException } from '@nestjs/throttler';
import { type Mocked, TestBed } from '@suites/unit';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { AuthService } from '@/core/auth/auth.service';
import { UserType } from '@/core/auth/enums';
import { AttemptLimiter } from '@/core/caching/attempt-limiter';
import { CommunicationsService } from '@/core/communications/communications.service';
import { OtpService } from '@/core/security/otp/otp.service';
import { Appointment } from '@/features/appointments/entities/appointment.entity';
import { FacilitiesService } from '@/features/facilities/facilities.service';
import { Patient } from '@/features/patients/entities/patient.entity';
import { Personnel } from '../entities/personnel.entity';
import { ChronicCareAuthService } from './chronic-care-auth.service';
import { PersonnelProviders, PersonnelRoles } from './dto';
import {
	PersonnelAccount,
	PersonnelAccountVerificationStatus,
} from './personnel-accounts/entities/personnel-account.entity';

describe('ChronicCareAuthService', () => {
	let service: ChronicCareAuthService;
	let personnelModel: Mocked<Model<Personnel>>;
	let personnelAccountModel: Mocked<Model<PersonnelAccount>>;
	let appointmentModel: Mocked<Model<Appointment>>;
	let patientModel: Mocked<Model<Patient>>;
	let authService: Mocked<AuthService>;
	let otpService: Mocked<OtpService>;
	let communicationsService: Mocked<CommunicationsService>;
	let facilitiesService: Mocked<FacilitiesService>;
	let attemptLimiter: Mocked<AttemptLimiter>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(
			ChronicCareAuthService,
		).compile();

		service = unit;
		personnelModel = unitRef.get(
			getModelToken(Personnel.name),
		) as unknown as Mocked<Model<Personnel>>;
		personnelAccountModel = unitRef.get(
			getModelToken(PersonnelAccount.name),
		) as unknown as Mocked<Model<PersonnelAccount>>;
		appointmentModel = unitRef.get(
			getModelToken(Appointment.name),
		) as unknown as Mocked<Model<Appointment>>;
		patientModel = unitRef.get(
			getModelToken(Patient.name),
		) as unknown as Mocked<Model<Patient>>;
		authService = unitRef.get(AuthService);
		otpService = unitRef.get(OtpService);
		communicationsService = unitRef.get(CommunicationsService);
		facilitiesService = unitRef.get(FacilitiesService);
		attemptLimiter = unitRef.get(AttemptLimiter);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		attemptLimiter.consume.mockResolvedValue(undefined);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create new personnel and personnel account', async () => {
			personnelAccountModel.findOne.mockResolvedValue(null);
			const mockPersonnelId = new Types.ObjectId();
			personnelModel.create.mockResolvedValue({
				_id: mockPersonnelId,
			} as any);

			const mockAccount = { _id: 'acc-1' };
			personnelAccountModel.create.mockResolvedValue(mockAccount as any);

			const input = {
				email: 'test@example.com',
				password: 'secretPassword',
				role: PersonnelRoles.CLINICIAN,
			};

			const result = await service.create(input);

			expect(personnelModel.create).toHaveBeenCalledWith({
				role: PersonnelRoles.CLINICIAN,
			});
			expect(personnelAccountModel.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: 'test@example.com',
					password: 'secretPassword',
					personnel: mockPersonnelId,
					verificationStatus: PersonnelAccountVerificationStatus.UNVERIFIED,
				}),
			);
			expect(result).toEqual(mockPersonnelId);
		});

		it('should refuse to attach a new account to an existing personnel', async () => {
			personnelAccountModel.findOne.mockResolvedValue({
				_id: 'google-acc',
				personnel: new Types.ObjectId(),
			} as any);
			personnelModel.exists.mockResolvedValue({ _id: 'p' } as any);

			await expect(
				service.create({
					email: 'victim@gmail.com',
					password: 'attackerPassword',
					role: PersonnelRoles.CLINICIAN,
				}),
			).rejects.toThrow(ConflictException);
			expect(personnelAccountModel.create).not.toHaveBeenCalled();
		});
	});

	describe('onboard', () => {
		it('still onboards when the address has had too many codes', async () => {
			const validPersonnelId = new Types.ObjectId().toString();
			mockExisting({ _id: validPersonnelId });
			personnelAccountModel.exists.mockResolvedValue(null);
			personnelModel.findOneAndUpdate.mockReturnValue({
				populate: vi.fn().mockResolvedValue({
					_id: validPersonnelId,
					role: PersonnelRoles.CLINICIAN,
					personnelAccounts: [
						{
							email: 'doc@example.com',
							verificationStatus: PersonnelAccountVerificationStatus.UNVERIFIED,
						},
					],
				}),
			} as any);
			otpService.generate.mockRejectedValue(new ThrottlerException());

			await expect(
				service.onboard({ personnelId: validPersonnelId } as any),
			).resolves.toBe(validPersonnelId);
			expect(communicationsService.sendMail).not.toHaveBeenCalled();
		});
		it('should onboard personnel and send verification code mail for OTP required roles', async () => {
			const validPersonnelId = new Types.ObjectId().toString();
			mockExisting({ _id: validPersonnelId });
			personnelAccountModel.exists.mockResolvedValue(null);
			facilitiesService.findOne.mockResolvedValue({} as any);

			const mockAccount = {
				email: 'doc@example.com',
				verificationStatus: PersonnelAccountVerificationStatus.UNVERIFIED,
				save: vi.fn().mockResolvedValue(true),
			};

			const mockPersonnel = {
				_id: validPersonnelId,
				userName: 'Dr. John',
				phoneNumber: '+233201234567',
				role: PersonnelRoles.CLINICIAN,
				personnelAccounts: [mockAccount],
			};

			personnelModel.findOneAndUpdate.mockReturnValue({
				populate: vi.fn().mockResolvedValue(mockPersonnel),
			} as any);

			otpService.generate.mockResolvedValue(123456);
			communicationsService.sendMail.mockReturnValue(undefined);

			const res = await service.onboard({
				personnelId: validPersonnelId,
				firstname: 'Dr.',
				lastname: 'John',
				facility: new Types.ObjectId().toString(),
			} as any);

			expect(facilitiesService.findOne).toHaveBeenCalled();
			expect(otpService.generate).toHaveBeenCalledWith({
				identifier: 'doc@example.com',
			});
			// The code proves the email, so it never goes to the supplied phone.
			expect(communicationsService.sendSms).not.toHaveBeenCalled();
			expect(res).toBe(validPersonnelId);
			const [filter, update] = personnelModel.findOneAndUpdate.mock
				.calls[0] as any;
			expect(update.$set.onboardedAt).toBeInstanceOf(Date);
			// The not-onboarded check is part of the write.
			expect(filter).toMatchObject({
				_id: validPersonnelId,
				onboardedAt: null,
			});
		});

		const mockExisting = (existing: object | null) =>
			personnelModel.findById.mockReturnValue({
				select: vi.fn().mockReturnValue({
					lean: vi.fn().mockResolvedValue(existing),
				}),
			} as any);

		const mockUpdated = () =>
			personnelModel.findOneAndUpdate.mockReturnValue({
				populate: vi.fn().mockResolvedValue({
					_id: 'id',
					role: PersonnelRoles.PHARMACY,
					personnelAccounts: [],
				}),
			} as any);

		it('should refuse to change an onboarded profile without a token', async () => {
			const personnelId = new Types.ObjectId().toString();
			mockExisting({ userName: 'Real Clinician' });

			await expect(
				service.onboard({
					personnelId,
					role: PersonnelRoles.PHARMACY,
				} as any),
			).rejects.toThrow(UnauthorizedException);
			expect(personnelModel.findOneAndUpdate).not.toHaveBeenCalled();
		});

		it('should refuse a token for a different personnel', async () => {
			const personnelId = new Types.ObjectId().toString();

			await expect(
				service.onboard(
					{ personnelId } as any,
					new Types.ObjectId().toString(),
				),
			).rejects.toThrow(ForbiddenException);
			expect(personnelModel.findOneAndUpdate).not.toHaveBeenCalled();
		});

		it('should let a personnel change their own onboarded profile', async () => {
			const personnelId = new Types.ObjectId().toString();
			const onboardedAt = new Date('2026-01-01');
			mockExisting({ userName: 'Real Clinician', onboardedAt });
			mockUpdated();

			await service.onboard(
				{ personnelId, firstname: 'New' } as any,
				personnelId,
			);

			const [, update] = personnelModel.findOneAndUpdate.mock.calls[0] as any;
			expect(update.$set.onboardedAt).toBe(onboardedAt);
		});

		it('should treat a profile with onboardedAt but no name as onboarded', async () => {
			mockExisting({ onboardedAt: new Date() });

			await expect(
				service.onboard({
					personnelId: new Types.ObjectId().toString(),
				} as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should refuse tokenless onboarding once an account can log in', async () => {
			const personnelId = new Types.ObjectId().toString();
			mockExisting({ _id: personnelId });
			personnelAccountModel.exists.mockResolvedValue({ _id: 'acc' } as any);

			await expect(
				service.onboard({
					personnelId,
					role: PersonnelRoles.CLINICIAN,
				} as any),
			).rejects.toThrow(UnauthorizedException);
			expect(personnelModel.findOneAndUpdate).not.toHaveBeenCalled();
		});

		it('should refuse when a concurrent tokenless onboarding won the write', async () => {
			const personnelId = new Types.ObjectId().toString();
			mockExisting({ _id: personnelId });
			personnelAccountModel.exists.mockResolvedValue(null);
			personnelModel.findOneAndUpdate.mockReturnValue({
				populate: vi.fn().mockResolvedValue(null),
			} as any);

			await expect(service.onboard({ personnelId } as any)).rejects.toThrow(
				UnauthorizedException,
			);
		});
	});

	describe('login', () => {
		it('should verify password with bcrypt and return JWT token', async () => {
			const hashedPassword = await bcrypt.hash('validPassword', 10);
			const mockPersonnelId = new Types.ObjectId();
			const mockAccount = {
				email: 'doc@example.com',
				password: hashedPassword,
				verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
				personnel: {
					_id: mockPersonnelId,
					role: PersonnelRoles.CLINICIAN,
				},
			};

			const mockQueryChain = {
				populate: vi.fn().mockResolvedValue(mockAccount),
			};
			personnelAccountModel.findOne.mockReturnValue(mockQueryChain as any);
			authService.signToken.mockResolvedValue({
				accessToken: 'jwt-access-token',
			} as any);

			const result = await service.login({
				email: 'doc@example.com',
				password: 'validPassword',
			});

			expect(personnelAccountModel.findOne).toHaveBeenCalledWith({
				provider: PersonnelProviders.EMAIL,
				email: 'doc@example.com',
			});
			expect(authService.signToken).toHaveBeenCalledWith(
				mockPersonnelId.toString(),
				{ audience: UserType.CHRONIC_CARE.toString() },
				{
					role: PersonnelRoles.CLINICIAN,
					email: 'doc@example.com',
					facility: undefined,
				},
			);
			expect(result).toEqual({
				personnelId: mockPersonnelId.toString(),
				token: { accessToken: 'jwt-access-token' },
			});
		});

		it('should throw UnauthorizedException for invalid password', async () => {
			const hashedPassword = await bcrypt.hash('validPassword', 10);
			const mockAccount = {
				email: 'doc@example.com',
				password: hashedPassword,
				verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
			};

			const mockQueryChain = {
				populate: vi.fn().mockResolvedValue(mockAccount),
			};
			personnelAccountModel.findOne.mockReturnValue(mockQueryChain as any);

			await expect(
				service.login({
					email: 'doc@example.com',
					password: 'wrongPassword',
				}),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should throw UnauthorizedException when personnel is unverified', async () => {
			const mockAccount = {
				email: 'doc@example.com',
				verificationStatus: PersonnelAccountVerificationStatus.UNVERIFIED,
			};

			const mockQueryChain = {
				populate: vi.fn().mockResolvedValue(mockAccount),
			};
			personnelAccountModel.findOne.mockReturnValue(mockQueryChain as any);

			await expect(
				service.login({
					email: 'doc@example.com',
					password: 'password',
				}),
			).rejects.toThrow(UnauthorizedException);
		});

		it('should reject a deleted account with 401 after the password check', async () => {
			const hashedPassword = await bcrypt.hash('validPassword', 10);
			const mockAccount = {
				email: 'doc@example.com',
				password: hashedPassword,
				verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
				personnel: null,
			};
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue(mockAccount),
			} as any);

			await expect(
				service.login({ email: 'doc@example.com', password: 'validPassword' }),
			).rejects.toThrow('This account has been deleted');
			expect(authService.signToken).not.toHaveBeenCalled();
		});

		it('should not reveal a deleted account to a wrong password', async () => {
			const hashedPassword = await bcrypt.hash('validPassword', 10);
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue({
					email: 'doc@example.com',
					password: hashedPassword,
					verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
					personnel: null,
				}),
			} as any);

			await expect(
				service.login({ email: 'doc@example.com', password: 'wrong' }),
			).rejects.toThrow('Invalid credentials');
		});

		it('should signal NotFound for a deleted Google account so it can re-register', async () => {
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue({
					email: 'doc@example.com',
					verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
					personnel: null,
				}),
			} as any);

			await expect(
				service.login({ email: 'doc@example.com', providerUserId: 'g-123' }),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('login lockout', () => {
		it('refuses an email over its limit before looking up the account', async () => {
			attemptLimiter.consume.mockRejectedValue(new ThrottlerException());

			await expect(
				service.login({ email: 'doc@example.com', password: 'x' }),
			).rejects.toThrow(ThrottlerException);
			expect(attemptLimiter.consume).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'login-attempt' }),
				'doc@example.com',
			);
			expect(personnelAccountModel.findOne).not.toHaveBeenCalled();
		});

		it('counts an unknown email the same way', async () => {
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue(null),
			} as any);

			await expect(
				service.login({ email: 'ghost@example.com', password: 'x' }),
			).rejects.toThrow(UnauthorizedException);
			expect(attemptLimiter.consume).toHaveBeenCalledWith(
				expect.anything(),
				'ghost@example.com',
			);
		});

		it('keeps the count after a wrong password', async () => {
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue({
					email: 'doc@example.com',
					password: await bcrypt.hash('validPassword', 4),
					verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
				}),
			} as any);

			await expect(
				service.login({ email: 'doc@example.com', password: 'nope' }),
			).rejects.toThrow(UnauthorizedException);
			expect(attemptLimiter.reset).not.toHaveBeenCalled();
		});

		it('clears the count after the right password', async () => {
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue({
					email: 'doc@example.com',
					password: await bcrypt.hash('validPassword', 4),
					verificationStatus: PersonnelAccountVerificationStatus.VERIFIED,
					personnel: {
						_id: new Types.ObjectId(),
						role: PersonnelRoles.CLINICIAN,
					},
				}),
			} as any);
			authService.signToken.mockResolvedValue('t' as any);

			await service.login({
				email: 'doc@example.com',
				password: 'validPassword',
			});
			expect(attemptLimiter.reset).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'login-attempt' }),
				'doc@example.com',
			);
		});

		it('counts case and space variants of an email as one', async () => {
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue(null),
			} as any);

			await expect(
				service.login({ email: ' Doc@Example.COM ', password: 'x' }),
			).rejects.toThrow(UnauthorizedException);
			expect(attemptLimiter.consume).toHaveBeenCalledWith(
				expect.anything(),
				'doc@example.com',
			);
			expect(personnelAccountModel.findOne).toHaveBeenCalledWith({
				provider: PersonnelProviders.EMAIL,
				email: 'doc@example.com',
			});
		});

		it('clears the count once the email is verified', async () => {
			const account = {
				email: 'doc@example.com',
				verificationStatus: PersonnelAccountVerificationStatus.UNVERIFIED,
				save: vi.fn().mockResolvedValue(true),
			};
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue(account),
			} as any);
			otpService.verify.mockResolvedValue(true);

			await service.verifyOnboardOtp({
				identifier: 'doc@example.com',
				code: 123456,
			});
			expect(account.verificationStatus).toBe(
				PersonnelAccountVerificationStatus.VERIFIED,
			);
			expect(attemptLimiter.reset).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'login-attempt' }),
				'doc@example.com',
			);
		});

		it('does not count Google sign-in', async () => {
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue(null),
			} as any);

			await expect(
				service.login({ providerUserId: 'g-1' } as any),
			).rejects.toThrow(NotFoundException);
			expect(attemptLimiter.consume).not.toHaveBeenCalled();
		});
	});

	describe('login verification by role', () => {
		const loginAs = async (
			role: PersonnelRoles,
			verificationStatus: PersonnelAccountVerificationStatus,
		) => {
			const mockAccount = {
				email: 'staff@example.com',
				password: await bcrypt.hash('validPassword', 4),
				verificationStatus,
				personnel: { _id: new Types.ObjectId(), role },
			};
			personnelAccountModel.findOne.mockReturnValue({
				populate: vi.fn().mockResolvedValue(mockAccount),
			} as any);
			authService.signToken.mockResolvedValue('token' as any);
			return service.login({
				email: 'staff@example.com',
				password: 'validPassword',
			});
		};

		it('should refuse an EXEMPT account whose role requires OTP', async () => {
			await expect(
				loginAs(
					PersonnelRoles.CLINICIAN,
					PersonnelAccountVerificationStatus.EXEMPT,
				),
			).rejects.toThrow(UnauthorizedException);
			expect(authService.signToken).not.toHaveBeenCalled();
		});

		it('should let an EXEMPT pharmacy account log in', async () => {
			await expect(
				loginAs(
					PersonnelRoles.PHARMACY,
					PersonnelAccountVerificationStatus.EXEMPT,
				),
			).resolves.toMatchObject({ token: 'token' });
		});
	});

	describe('deletePersonnel', () => {
		it('should delete personnel, accounts, and revoke tokens', async () => {
			const mockPersonnelId = new Types.ObjectId();
			const mockAccountId = new Types.ObjectId();
			personnelModel.findById.mockResolvedValue({
				_id: mockPersonnelId,
				personnelAccounts: [mockAccountId],
			} as any);
			appointmentModel.countDocuments.mockResolvedValue(0);
			personnelAccountModel.deleteMany.mockResolvedValue({} as any);
			personnelModel.findByIdAndDelete.mockResolvedValue({} as any);
			authService.revokePersonnelTokens.mockResolvedValue({} as any);
			patientModel.updateMany.mockResolvedValue({} as any);

			await service.deletePersonnel(mockPersonnelId.toString());

			expect(personnelAccountModel.deleteMany).toHaveBeenCalledWith({
				$or: [
					{ personnel: mockPersonnelId },
					{ _id: { $in: [mockAccountId] } },
				],
			});
			expect(personnelModel.findByIdAndDelete).toHaveBeenCalledWith(
				mockPersonnelId.toString(),
			);
			expect(authService.revokePersonnelTokens).toHaveBeenCalledWith(
				mockPersonnelId.toString(),
			);
			expect(patientModel.updateMany).toHaveBeenCalledWith(expect.anything(), {
				$pull: {
					doctorsVisited: mockPersonnelId,
					pharmaciesVisited: mockPersonnelId,
				},
			});
		});

		it('should refuse deletion while the personnel hosts open appointments', async () => {
			personnelModel.findById.mockResolvedValue({
				_id: new Types.ObjectId(),
			} as any);
			appointmentModel.countDocuments.mockResolvedValue(2);

			await expect(
				service.deletePersonnel(new Types.ObjectId().toString()),
			).rejects.toThrow(ConflictException);
			expect(personnelAccountModel.deleteMany).not.toHaveBeenCalled();
			expect(personnelModel.findByIdAndDelete).not.toHaveBeenCalled();
		});

		it('should throw NotFoundException if personnel to delete does not exist', async () => {
			personnelModel.findById.mockResolvedValue(null);

			await expect(service.deletePersonnel('invalid-id')).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
