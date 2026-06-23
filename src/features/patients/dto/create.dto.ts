import { PickType } from '@nestjs/swagger';
import { PatientDto } from './patient.dto';

export class CreatePatientDto extends PickType(PatientDto, [
	'patientCode',
	'userId',
	'name',
	'dateOfBirth',
	'gender',
	'timezone',
]) {
	chronicConditions: string[];
}
