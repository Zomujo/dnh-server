import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import { NodeEnvs } from './common/enums';
import {
	resolveCorsOrigins,
	resolveForbidUnknownFields,
	resolveTrustProxy,
} from './common/utils/helpers';
import { DomainLogger } from './core/logging/logging.service';

async function bootstrap() {
	const parsedPort = parseInt(process.env.PORT as string);
	const PORT = Number.isNaN(parsedPort) ? 4815 : parsedPort;
	const environment = process.env.NODE_ENV as NodeEnvs;

	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		bufferLogs: true,
	});

	if (environment !== NodeEnvs.DEVELOPMENT) {
		app.useLogger(app.get(DomainLogger));
	}

	// Behind Railway's proxy every request arrives from the proxy's address;
	// without this, req.ip (rate limiting, logs) is the same for everyone.
	app.set('trust proxy', resolveTrustProxy());

	// The mobile app isn't a browser and doesn't need CORS; only browser
	// clients (the HCP web app) do, so production should list them.
	const corsOrigins = resolveCorsOrigins();
	if (corsOrigins === true && environment === NodeEnvs.PRODUCTION) {
		new Logger('Bootstrap').warn(
			'CORS_ORIGINS is not set: any browser origin may call this API.',
		);
	}
	app.enableCors({ origin: corsOrigins });
	useContainer(app.select(AppModule), { fallbackOnErrors: true });

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			// Staging: unknown fields are a 400 rather than silently dropped.
			forbidNonWhitelisted: resolveForbidUnknownFields(environment),
			transform: true,
		}),
	);

	app.setGlobalPrefix('/api/v1', {
		exclude: [{ path: '', method: RequestMethod.GET }],
	});

	const config = new DocumentBuilder()
		.setTitle('DNH Services')
		.setDescription('API endpoints to be utilized in the DNH Application')
		.setVersion('1.0')
		.addBearerAuth(
			{
				description: 'Please enter token in following format:<JWT>',
				name: 'Authorization',
				bearerFormat: 'Bearer',
				scheme: 'Bearer',
				type: 'http',
				in: 'Header',
			},
			'access-token',
		)
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('docs', app, document, {
		ui: environment !== NodeEnvs.PRODUCTION,
		raw: environment !== NodeEnvs.PRODUCTION,
		swaggerOptions: {
			tagsSorter: 'alpha',
		},
	});

	await app.listen(PORT);
	console.info(`APP IS LISTENING ON PORT ${PORT}`);
	console.info(`SERVER IS RUNNING AT http://localhost:${PORT}`);
	console.info(`ACCESS SWAGGER DOCUMENTATION AT http://localhost:${PORT}/docs`);
	return;
}
bootstrap();
