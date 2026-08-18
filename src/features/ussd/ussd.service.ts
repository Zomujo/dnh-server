import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/core/caching/caching.service';
import { VitalTypes } from '@/features/vital-histories/dto/vital-history.dto';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { PatientsService } from '../patients/patients.service';

interface UssdSessionState {
	patientId?: string;
	userId?: string;
	vitalType?: VitalTypes;
	value?: string;
	recordedAt?: Date;
}

const VITAL_OPTIONS: Record<
	string,
	{ vitalType: VitalTypes; label: string; hint: string }
> = {
	'1': {
		vitalType: VitalTypes.BLOOD_PRESSURE,
		label: 'Blood Pressure',
		hint: 'e.g. 120/80',
	},
	'2': {
		vitalType: VitalTypes.BLOOD_SUGAR,
		label: 'Blood Sugar',
		hint: 'e.g. 5.6',
	},
};

const SESSION_TTL = 1000 * 60 * 5; // 5 minutes

@Injectable()
export class UssdService {
	private readonly logger = new Logger(UssdService.name);

	constructor(
		private readonly patientsService: PatientsService,
		private readonly vitalHistoriesService: VitalHistoriesService,
		private readonly cacheService: CacheService<UssdSessionState>,
	) {}

	async handleSession(
		sessionId: string,
		phoneNumber: string,
		text: string,
	): Promise<string> {
		const inputs = text ? text.split('*') : [];
		const cacheKey = `ussd:session:${sessionId}`;

		// Step 0 — welcome screen, no state yet
		if (inputs.length === 0) {
			return (
				'CON Welcome to Yelima Health.\n' +
				'Select a vital to log:\n' +
				'1. Blood Pressure\n' +
				'2. Blood Sugar'
			);
		}

		const vitalChoice = inputs[0];
		const vital = VITAL_OPTIONS[vitalChoice];

		if (!vital) {
			return 'END Invalid selection. Please dial again and choose 1 or 2.';
		}

		// Step 1 — store vitalType, prompt for value
		if (inputs.length === 1) {
			await this.cacheService.set(
				cacheKey,
				{ vitalType: vital.vitalType },
				SESSION_TTL,
			);
			return `CON Enter your ${vital.label} reading:\n(${vital.hint})`;
		}

		const value = inputs[1].trim();

		if (!value) {
			return 'END Invalid value entered. Please dial again.';
		}

		// Step 2 — store value, ask when recorded
		if (inputs.length === 2) {
			const state = await this.cacheService.get(cacheKey);
			await this.cacheService.set(cacheKey, { ...state, value }, SESSION_TTL);
			return (
				`CON ${vital.label}: ${value}\n` +
				'When did you take this reading?\n' +
				'1. Just now\n' +
				'2. At a different time'
			);
		}

		const timingChoice = inputs[2];

		// Step 3a — just now: store recordedAt and save
		if (inputs.length === 3 && timingChoice === '1') {
			const state = await this.cacheService.get(cacheKey);
			const recordedAt = new Date();
			await this.cacheService.set(
				cacheKey,
				{ ...state, recordedAt },
				SESSION_TTL,
			);
			return this.saveReading(cacheKey, sessionId, phoneNumber);
		}

		// Step 3b — different time: prompt for date/time
		if (inputs.length === 3 && timingChoice === '2') {
			return 'CON Enter date & time of reading:\nFormat: DD-MM-YY HH:MM AM|PM\ne.g. 18-08-26 02:30 PM';
		}

		// Step 4 — parse date/time, store recordedAt and save
		if (inputs.length === 4 && timingChoice === '2') {
			const recordedAt = this.parseDateTimeInput(inputs[3]);
			if (!recordedAt) {
				return 'END Invalid format. Please dial again and use DD-MM-YY HH:MM AM|PM (e.g. 18-08-26 02:30 PM).';
			}
			const state = await this.cacheService.get(cacheKey);
			await this.cacheService.set(
				cacheKey,
				{ ...state, recordedAt },
				SESSION_TTL,
			);
			return this.saveReading(cacheKey, sessionId, phoneNumber);
		}

		return 'END An error occurred. Please dial again.';
	}

	private async saveReading(
		cacheKey: string,
		sessionId: string,
		phoneNumber: string,
	): Promise<string> {
		try {
			const state = await this.cacheService.get(cacheKey);

			if (!state?.vitalType || !state?.value || !state?.recordedAt) {
				return 'END Session data incomplete. Please dial again.';
			}

			const patient = await this.resolvePatient(state, sessionId, phoneNumber);

			if (!patient) {
				return 'END Your phone number is not linked to a Yelima account. Please register via the app.';
			}

			await this.vitalHistoriesService.loadVitalHistory(
				{
					vitalType: state.vitalType,
					value: state.value,
					recordedAt: state.recordedAt,
					patient: patient.patientId,
				},
				patient.userId,
			);

			await this.cacheService.delete(cacheKey);

			return 'END Reading logged successfully.\nStay healthy!';
		} catch (error) {
			this.logger.error('USSD save reading failed', error);
			return 'END Could not save your reading. Please try again later.';
		}
	}

	private async resolvePatient(
		state: UssdSessionState,
		sessionId: string,
		phoneNumber: string,
	): Promise<{ patientId: string; userId: string } | null> {
		if (state.patientId && state.userId) {
			return { patientId: state.patientId, userId: state.userId };
		}

		const patient = await this.patientsService.findPatientByPhoneNumber(
			phoneNumber,
			'_id userId',
		);

		if (!patient) return null;

		const cacheKey = `ussd:session:${sessionId}`;
		await this.cacheService.set(
			cacheKey,
			{ ...state, patientId: patient._id.toString(), userId: patient.userId },
			SESSION_TTL,
		);

		return { patientId: patient._id.toString(), userId: patient.userId };
	}

	private parseDateTimeInput(input: string): Date | null {
		const match = input
			.trim()
			.match(/^(\d{2})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
		if (!match) return null;

		const [, dd, mm, yy, rawHh, min, ampm] = match;
		let hh = parseInt(rawHh, 10);

		if (ampm) {
			const period = ampm.toUpperCase();
			if (hh < 1 || hh > 12) return null;
			if (period === 'PM' && hh < 12) hh += 12;
			if (period === 'AM' && hh === 12) hh = 0;
		} else {
			if (hh < 0 || hh > 23) return null;
		}

		const date = new Date(
			2000 + parseInt(yy, 10),
			parseInt(mm, 10) - 1,
			parseInt(dd, 10),
			hh,
			parseInt(min, 10),
		);

		return isNaN(date.getTime()) ? null : date;
	}
}
