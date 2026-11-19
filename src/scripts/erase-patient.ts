import '../set-time-zone';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ClientService } from '../features/client/client.service';
import { PatientDataExportService } from '../features/patients/patient-data-export.service';
import { PatientsService } from '../features/patients/patients.service';

/**
 * Operator tool for a data subject's erasure request when the patient has no
 * app account to run DELETE /client/clean themselves (registered at a
 * facility, or USSD only). Runs the same purge as the app endpoint.
 *
 *   node dist/scripts/erase-patient.js <patientCode>            # dry run
 *   node dist/scripts/erase-patient.js <patientCode> --confirm  # erase
 *
 * Run it with the production environment loaded, from a trusted host, and
 * record the request (who asked, when, who ran it) outside the system.
 */
async function main() {
	const [patientCode, flag] = process.argv.slice(2);
	if (!patientCode) {
		console.error(
			'Usage: node dist/scripts/erase-patient.js <patientCode> [--confirm]',
		);
		process.exitCode = 2;
		return;
	}
	const confirm = flag === '--confirm';

	const app = await NestFactory.createApplicationContext(AppModule, {
		logger: ['error', 'warn'],
	});
	try {
		const patient = await app
			.get(PatientsService, { strict: false })
			.findPatientByCode(patientCode, '_id userId');
		if (!patient) {
			console.error(`No patient with code ${patientCode}`);
			process.exitCode = 1;
			return;
		}

		const exported = await app
			.get(PatientDataExportService, { strict: false })
			.exportByUserId(patient.userId);
		const counts = Object.fromEntries(
			Object.entries(exported)
				.filter(([, value]) => Array.isArray(value))
				.map(([key, value]) => [key, (value as unknown[]).length]),
		);
		console.info(`Patient ${patientCode}: records held`, counts);

		if (!confirm) {
			console.info('Dry run: nothing deleted. Re-run with --confirm.');
			return;
		}

		const result = await app
			.get(ClientService, { strict: false })
			.purgePatient(patient.userId);
		console.info(`Patient ${patientCode} erased`, result.deleted);
	} finally {
		await app.close();
	}
}

main().catch((error) => {
	console.error('Erasure failed; it is safe to run again.', error);
	process.exitCode = 1;
});
