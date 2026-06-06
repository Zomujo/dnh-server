import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import { NodeEnvs } from './common/enums';
import { DomainLogger } from './core/logging/logging.service';

async function bootstrap() {
	const PORT = parseInt(process.env.PORT as string) ?? 4815;
	const environment = process.env.NODE_ENV as NodeEnvs;

	const app = await NestFactory.create(AppModule, {
		bufferLogs: true,
	});

	if (environment !== NodeEnvs.DEVELOPMENT) {
		app.useLogger(app.get(DomainLogger));
	}

	app.enableCors();
	useContainer(app.select(AppModule), { fallbackOnErrors: true });

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
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
