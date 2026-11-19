// Must stay the first imports: they set process-wide state the modules
// below read when they load.
import './disable-background-jobs';
import '../set-time-zone';
import { NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientService } from '../features/client/client.service';
import { PatientDataExportService } from '../features/patients/patient-data-export.service';
import { PatientsService } from '../features/patients/patients.service';
import { ErasePatientModule } from './erase-patient.module';

const USAGE = `Usage:
  node dist/scripts/erase-patient.js <patientCode> [--confirm]
  node dist/scripts/erase-patient.js --user-id <userId> [--confirm]`;

/**
 * Operator tool for a data subject's erasure request when the patient has no
 * app account to run DELETE /client/clean themselves (registered at a
 * facility, or USSD only). Runs the same purge as the app endpoint.
 *
 *   node dist/scripts/erase-patient.js <patientCode>            # dry run
 *   node dist/scripts/erase-patient.js <patientCode> --confirm  # erase
 *
 * `--user-id <userId>` instead of a patient code finishes an erasure that
 * failed after the patient record was deleted (the code no longer resolves,
 * but the Firebase account or other rows keyed by the user id may remain).
 * The failure message prints the user id to use.
 *
 * Boots ErasePatientModule, not the API: no HTTP server, no cron, and queue
 * workers don't take jobs (DISABLE_BACKGROUND_JOBS, set by the first import).
 * Run it with the production environment loaded, from a trusted host, and
 * record the request (who asked, when, who ran it) outside the system.
 */
function parseArgs(args: string[]) {
	const confirm = args.includes('--confirm');
	const rest = args.filter((arg) => arg !== '--confirm');
	if (rest[0] === '--user-id') {
		return rest.length === 2 ? { userId: rest[1], confirm } : undefined;
	}
	return rest.length === 1 && !rest[0].startsWith('--')
		? { patientCode: rest[0], confirm }
		: undefined;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args) {
		console.error(USAGE);
		process.exitCode = 2;
		return;
	}

	const app = await NestFactory.createApplicationContext(ErasePatientModule, {
		logger: ['error', 'warn'],
	});
	let userId = args.userId;
	try {
		const label = args.patientCode
			? `Patient ${args.patientCode}`
			: `User ${args.userId}`;
		if (args.patientCode) {
			const patient = await app
				.get(PatientsService, { strict: false })
				.findPatientByCode(args.patientCode, '_id userId');
			if (!patient) {
				console.error(
					`No patient with code ${args.patientCode}. If an earlier erasure of this patient failed part-way, finish it with --user-id <userId> (printed by that run).`,
				);
				process.exitCode = 1;
				return;
			}
			userId = patient.userId;
		}
		if (!userId) throw new Error('No user id');

		try {
			const exported = await app
				.get(PatientDataExportService, { strict: false })
				.exportByUserId(userId);
			const counts = Object.fromEntries(
				Object.entries(exported)
					.filter(([, value]) => Array.isArray(value))
					.map(([key, value]) => [key, (value as unknown[]).length]),
			);
			console.info(`${label} (user id ${userId}): records held`, counts);
		} catch (error) {
			if (!(error instanceof NotFoundException)) throw error;
			console.info(
				`${label}: no patient record. The purge removes whatever is left under this user id (Firebase account, Firestore records, device tokens, reminders).`,
			);
		}

		if (!args.confirm) {
			console.info('Dry run: nothing deleted. Re-run with --confirm.');
			return;
		}

		const result = await app
			.get(ClientService, { strict: false })
			.purgePatient(userId);
		console.info(`${label} erased`, result.deleted);
	} catch (error) {
		// Each purge step deletes by user id and skips what is already gone, so
		// running it again finishes the job. The patient record is deleted near
		// the end, after which the code no longer resolves: hence the user id.
		console.error(
			userId
				? `Erasure failed. Run again with: --user-id ${userId} --confirm`
				: 'Erasure failed before anything was deleted.',
			error,
		);
		process.exitCode = 1;
	} finally {
		await app.close();
	}
}

main().catch((error) => {
	console.error('Erasure could not start; nothing was deleted.', error);
	process.exitCode = 1;
});
