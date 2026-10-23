import { PickType } from '@nestjs/swagger';
import { PersonnelAccountDto } from './personnel-account.dto';

export class CreatePersonnelAccountDto extends PickType(PersonnelAccountDto, [
	'provider',
	'providerUserId',
	'email',
	'password',
]) {
	declare personnel: string;
}
