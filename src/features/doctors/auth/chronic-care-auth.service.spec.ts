import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { AuthService } from '@/core/auth/auth.service';
import { UserType } from '@/core/auth/enums';
import { CommunicationsService } from '@/core/communications/communications.service';
import { OtpService } from '@/core/security/otp/otp.service';
import { FacilitiesService } from '@/features/facilities/facilities.service';
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
	let authService: Mocked<AuthService>;
	let otpService: Mocked<OtpService>;
	let communicationsService: Mocked<CommunicationsService>;
	let facilitiesService: Mocked<FacilitiesService>;

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
		authService = unitRef.get(AuthService);
		otpService = unitRef.get(OtpService);
		communicationsService = unitRef.get(CommunicationsService);
		facilitiesService = unitRef.get(FacilitiesService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
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
	});

	describe('onboard', () => {
		it('should onboard personnel and send verification code mail for OTP required roles', async () => {
			const validPersonnelId = new Types.ObjectId().toString();
			personnelModel.exists.mockResolvedValue(true as any);
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

			personnelModel.findByIdAndUpdate.mockReturnValue({
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
			expect(res).toBe(validPersonnelId);
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
	});

	describe('deletePersonnel', () => {
		it('should delete personnel, accounts, and revoke tokens', async () => {
			const mockPersonnelId = new Types.ObjectId().toString();
			personnelModel.findById.mockResolvedValue({
				_id: mockPersonnelId,
			} as any);
			personnelAccountModel.deleteMany.mockResolvedValue({} as any);
			personnelModel.findByIdAndDelete.mockResolvedValue({} as any);
			authService.revokePersonnelTokens.mockResolvedValue({} as any);

			await service.deletePersonnel(mockPersonnelId);

			expect(personnelAccountModel.deleteMany).toHaveBeenCalledWith({
				personnel: mockPersonnelId,
			});
			expect(personnelModel.findByIdAndDelete).toHaveBeenCalledWith(
				mockPersonnelId,
			);
			expect(authService.revokePersonnelTokens).toHaveBeenCalledWith(
				mockPersonnelId,
			);
		});

		it('should throw NotFoundException if personnel to delete does not exist', async () => {
			personnelModel.findById.mockResolvedValue(null);

			await expect(service.deletePersonnel('invalid-id')).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
