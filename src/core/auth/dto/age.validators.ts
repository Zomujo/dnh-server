import {
	ValidationArguments,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator';
import { differenceInYears } from 'date-fns';

// Kept free of feature imports: the patients DTOs use these too, and
// importing them via create.dto (which imports the patient entity) closed an
// import cycle that left CreateAuthDto undefined when UpdateAuthDto extends it.

@ValidatorConstraint({ name: 'ageOrDateOfBirth', async: false })
export class AgeOrDateOfBirthConstraint
	implements ValidatorConstraintInterface
{
	validate(_value: any, args: ValidationArguments) {
		const dto = args.object as any;
		return !!(dto.age || dto.dateOfBirth);
	}

	defaultMessage() {
		return 'Either age or dateOfBirth must be provided';
	}
}

/** Self-onboarding is adults-only; minors must be registered by an HCP. */
export const MINIMUM_PATIENT_AGE = 18;

@ValidatorConstraint({ name: 'minimumAge', async: false })
export class MinimumAgeConstraint implements ValidatorConstraintInterface {
	validate(value: unknown) {
		if (!(value instanceof Date) || Number.isNaN(value.getTime())) return true; // IsDate reports it
		return differenceInYears(new Date(), value) >= MINIMUM_PATIENT_AGE;
	}

	defaultMessage() {
		return `Patients must be at least ${MINIMUM_PATIENT_AGE} years old`;
	}
}
