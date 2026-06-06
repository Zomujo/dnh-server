import { DECORATORS } from '@nestjs/swagger';

export function getExamplesFromDto<T extends new (...args: any[]) => any>(
	dtoClass: T,
	_propertyKey?: string,
): InstanceType<T> {
	const properties: symbol[] = Reflect.getMetadata(
		DECORATORS.API_MODEL_PROPERTIES_ARRAY,
		dtoClass.prototype,
	);
	const propertiesArray = properties.map((property) =>
		property.toString().replace(':', ''),
	);

	const metadataObj: Record<string, any> = {};

	for (const property of propertiesArray) {
		const refMeta = Reflect.getMetadata(
			DECORATORS.API_MODEL_PROPERTIES,
			dtoClass.prototype,
			property.toString().replace(':', ''),
		);

		if (refMeta) {
			metadataObj[property] = refMeta.example || null;
		} else {
			metadataObj[property] = null;
		}
	}

	return metadataObj as InstanceType<T>;
}
