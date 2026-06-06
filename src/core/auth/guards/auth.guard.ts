import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { AUTHORIZE_KEY, USER_TYPE_KEY } from '@/common/decorators';
import { CacheService } from '../../caching/caching.service';
import { FirebaseService } from '../../firebase/firebase.service';
import { AuthService } from '../auth.service';
import { LocalAuthUserPayload, UserPayload } from '../dto';
import { UserType } from '../enums';

@Injectable()
export class AuthGuard implements CanActivate {
	private logger = new Logger(AuthGuard.name);
	constructor(
		private firebaseService: FirebaseService,
		private authService: AuthService,
		private reflector: Reflector,
		private readonly userCacheService: CacheService<UserPayload>,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const authorize = this.reflector.getAllAndOverride<boolean>(AUTHORIZE_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		const tokenAudience = this.reflector.getAllAndOverride<UserType>(
			USER_TYPE_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (!authorize) {
			return true;
		}

		let verifyToken: (
			token: string,
		) => Promise<DecodedIdToken | LocalAuthUserPayload>;

		switch (tokenAudience) {
			case UserType.DH_CLIENTS:
			case UserType.CHRONIC_CARE:
				verifyToken = (token) => this.authService.verifyChronicCareToken(token);
				break;
			default:
				throw new Error('Unknown token audience');
		}

		const request = context.switchToHttp().getRequest();

		const token = this.extractTokenFromHeader(request);
		if (!token) {
			throw new UnauthorizedException('TOKEN ABSENT');
		}

		try {
			const payload = await verifyToken(token);
			if ([UserType.DEV].includes(tokenAudience)) {
				const tokenDecoded = await verifyToken(token);
				const cachUser = await this.userCacheService.get(tokenDecoded.sub);
				if (!cachUser) {
					await this.cacheUser(tokenDecoded.sub);
				}
			}

			request['user'] = payload;
		} catch (error) {
			const code = (error as { code?: string }).code;
			if (code == 'auth/argument-error') {
				throw new ForbiddenException();
			} else {
				this.logger.error('auth guard error: ', error);
				throw new UnauthorizedException();
			}
		}
		return true;
	}

	private extractTokenFromHeader(request: Request): string | undefined {
		const [type, token] = request.headers.authorization?.split(' ') ?? [];
		return type === 'Bearer' ? token : undefined;
	}

	private async cacheUser(userId: string) {
		const user = (await this.firebaseService.retrieveDoc('clients', userId))
			.doc;
		const contact = `+${user.phone_number.dial_code}${user.phone_number.number}`;
		const fiftyMinsTtl = 50 * 60000;

		const userCache = await this.userCacheService.set(
			userId,
			{
				name: user.name,
				phoneNumber: contact,
			},
			fiftyMinsTtl,
		);
		this.logger.log('user cached successfully', userCache);
	}
}
