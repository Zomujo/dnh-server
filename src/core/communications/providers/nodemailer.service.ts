import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
// import { validateOrReject } from 'class-validator';
import { MailDto } from '../dto';

@Injectable()
export class NodemailerService {
	private logger = new Logger(NodemailerService.name);
	constructor(
		private readonly mailService: MailerService,
		private readonly configService: ConfigService,
	) {}

	send(payload: MailDto) {
		// await validateOrReject(payload);
		this.mailService
			.sendMail({
				from: this.configService.get<string>('EMAIL_FROM'),
				to: payload.recipient,
				subject: payload.subject,
				text: payload.message,
				template: payload.template,
				context: payload.context,
			})
			// Only the message id: the SMTP response lists the recipients.
			.then((success) => {
				this.logger.log(`mail sent: ${success?.messageId ?? 'no message id'}`);
			})
			// Code and message only: the error object can carry the envelope
			// (recipient addresses) and the SMTP response.
			.catch((err) => {
				this.logger.error(
					`mail sending error: ${err?.code ?? 'unknown'} ${err?.message ?? ''}`.trim(),
				);
			});
	}
}
