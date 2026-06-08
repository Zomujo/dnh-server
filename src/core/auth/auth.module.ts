import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PatientsModule } from '@/features/patients/patients.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, RolesGuard } from './guards';

@Global()
@Module({
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			useFactory: (configService: ConfigService) => ({
				global: true,
				secret: configService.get('JWT_SECRET'),
				signOptions: { expiresIn: '1d' },
			}),
			inject: [ConfigService],
		}),
		PatientsModule,
	],
	controllers: [AuthController],
	providers: [
		AuthService,
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		{
			provide: APP_GUARD,
			useClass: RolesGuard,
		},
	],
	exports: [AuthService],
})
export class AuthModule {}
