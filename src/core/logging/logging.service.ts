import {
	ConsoleLogger,
	Injectable,
	LogLevel,
	OnApplicationShutdown,
	Optional,
} from '@nestjs/common';
import {
	createOpenObserveTransport,
	OpenObserveTransport,
	stringifyLogMessage,
} from './openobserve.transport';

/**
 * The app's logger outside development: prints like Nest's ConsoleLogger
 * (the container log) and also sends every printed line to OpenObserve when
 * OPENOBSERVE_URL, OPENOBSERVE_USER and OPENOBSERVE_TOKEN are set.
 */
@Injectable()
export class DomainLogger
	extends ConsoleLogger
	implements OnApplicationShutdown
{
	private readonly transport: OpenObserveTransport | null;

	constructor(
		@Optional() context?: string,
		@Optional() transport?: OpenObserveTransport | null,
	) {
		super(context || 'DefaultContext');
		this.transport =
			transport === undefined ? createOpenObserveTransport() : transport;
		if (!this.transport && process.env.NODE_ENV !== 'development') {
			super.warn(
				'OPENOBSERVE_URL, OPENOBSERVE_USER or OPENOBSERVE_TOKEN is not set: logs go to the console only.',
				'DomainLogger',
			);
		}
	}

	// Every level ends up here once ConsoleLogger has worked out the context and
	// stack and checked the level is enabled, so OpenObserve gets exactly what
	// the console prints.
	protected printMessages(
		messages: unknown[],
		context?: string,
		logLevel?: LogLevel,
		writeStreamType?: 'stdout' | 'stderr',
		errorStack?: unknown,
		params?: Record<string, any>,
	): void {
		super.printMessages(
			messages,
			context,
			logLevel,
			writeStreamType,
			errorStack,
			params,
		);
		if (!this.transport) return;
		messages.forEach((message, index) => {
			const stack =
				(index === 0 && typeof errorStack === 'string'
					? errorStack
					: undefined) ??
				(message instanceof Error ? message.stack : undefined);
			this.transport!.send({
				level: logLevel ?? 'log',
				message: stringifyLogMessage(this.resolveMessage(message)),
				context: context || undefined,
				stack,
			});
		});
	}

	async onApplicationShutdown(): Promise<void> {
		await this.transport?.close();
	}
}
