import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type Mocked, TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { CacheService } from '@/core/caching/caching.service';
import { PatientsService } from '@/features/patients/patients.service';
import { FirebaseService } from '../firebase/firebase.service';
import { AuthService } from './auth.service';
import { UserType } from './enums';

describe('AuthService', () => {
	let service: AuthService;
	let firebaseService: Mocked<FirebaseService>;
	let jwtService: Mocked<JwtService>;
	let configService: Mocked<ConfigService>;
	let patientsService: Mocked<PatientsService>;
	let tokenDenylistCache: Mocked<CacheService<number>>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(AuthService).compile();

		service = unit;
		firebaseService = unitRef.get(FirebaseService);
		jwtService = unitRef.get(JwtService);
		configService = unitRef.get(ConfigService);
		patientsService = unitRef.get(PatientsService);
		tokenDenylistCache = unitRef.get(CacheService) as unknown as Mocked<
			CacheService<number>
		>;
	});

	beforeEach(() => {
		vi.clearAllMocks();
		configService.get.mockReturnValue('http://localhost:4815');
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('signup', () => {
		it('should create firebase user and return uid', async () => {
			(firebaseService as any).auth = {
				createUser: vi.fn().mockResolvedValue({ uid: 'fb-user-123' }),
			};

			const uid = await service.signup({
				email: 'patient@example.com',
				password: 'Password123!',
			});

			expect((firebaseService as any).auth.createUser).toHaveBeenCalledWith({
				email: 'patient@example.com',
				emailVerified: false,
				disabled: false,
				password: 'Password123!',
				displayName: 'patient@example.com',
			});
			expect(uid).toBe('fb-user-123');
		});
	});

	describe('onboarding', () => {
		it('should create patient profile with calculated age from dateOfBirth', async () => {
			const mockId = new Types.ObjectId('64b1f2a7a2b3c9d5f8e2a111');
			patientsService.create.mockResolvedValue(mockId);

			const dob = new Date('1990-01-01');
			const patientId = await service.onboarding('user-123', {
				firstname: 'John',
				lastname: 'Doe',
				dateOfBirth: dob,
				gender: 'male' as any,
			} as any);

			expect(patientsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-123',
					name: 'John Doe',
					dateOfBirth: dob,
					age: expect.any(Number),
				}),
			);
			expect(patientId).toEqual(mockId);
		});
	});

	describe('signToken', () => {
		it('should sign JWT token with sub and custom payload', async () => {
			jwtService.signAsync.mockResolvedValue('signed-jwt-token');

			const token = await service.signToken(
				'user-123',
				{
					audience: UserType.CHRONIC_CARE.toString(),
				},
				{ role: 'CLINICIAN' },
			);

			expect(jwtService.signAsync).toHaveBeenCalledWith(
				{ sub: 'user-123', role: 'CLINICIAN' },
				{
					audience: UserType.CHRONIC_CARE.toString(),
					issuer: 'http://localhost:4815',
				},
			);
			expect(token).toBe('signed-jwt-token');
		});
	});

	describe('verifyChronicCareToken', () => {
		it('should verify token and return payload if not revoked', async () => {
			const iat = Math.floor(Date.now() / 1000);
			jwtService.verifyAsync.mockResolvedValue({
				sub: 'user-123',
				iat,
			} as any);

			tokenDenylistCache.get.mockResolvedValue(null);

			const payload = await service.verifyChronicCareToken('token-123');

			expect(jwtService.verifyAsync).toHaveBeenCalledWith('token-123', {
				audience: UserType.CHRONIC_CARE.toString(),
				issuer: 'http://localhost:4815',
			});
			expect(payload).toEqual({ sub: 'user-123', iat });
		});

		it('should throw UnauthorizedException if token was issued prior to revocation timestamp', async () => {
			const now = Date.now();
			const tokenIatSec = Math.floor((now - 10000) / 1000); // 10s ago

			jwtService.verifyAsync.mockResolvedValue({
				sub: 'user-123',
				iat: tokenIatSec,
			} as any);

			tokenDenylistCache.get.mockResolvedValue(now); // Revoked 0s ago

			await expect(service.verifyChronicCareToken('token-123')).rejects.toThrow(
				UnauthorizedException,
			);
		});
	});

	describe('revokePersonnelTokens', () => {
		it('should set revocation timestamp in denylist cache', async () => {
			tokenDenylistCache.set.mockResolvedValue(undefined as any);

			await service.revokePersonnelTokens('personnel-123');

			expect(tokenDenylistCache.set).toHaveBeenCalledWith(
				'chronic-care-token-revoked:personnel-123',
				expect.any(Number),
				24 * 60 * 60 * 1000,
			);
		});
	});
});
