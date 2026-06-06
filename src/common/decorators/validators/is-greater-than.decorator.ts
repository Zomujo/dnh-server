import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';

export function IsGreaterThan(property: string, options?: ValidationOptions) {
	return (object: any, propertyName: string) => {
		registerDecorator({
			name: 'isGreaterThan',
			target: object.constructor,
			propertyName,
			constraints: [property],
			options,
			validator: {
				validate(value: any, args: ValidationArguments) {
					const [relatedProperty] = args.constraints;
					const relatedValue = (args.object as any)[relatedProperty];
					if (!value || !relatedValue) return true;
					return new Date(value) > new Date(relatedValue);
				},
				defaultMessage(args: ValidationArguments) {
					const [relatedProperty] = args.constraints;
					return `${args.property} must be greater than ${relatedProperty}`;
				},
			},
		});
	};
}
