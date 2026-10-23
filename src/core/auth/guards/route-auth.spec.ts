import type { Type } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AUTHORIZE_KEY } from '@/common/decorators';
import { AuthController } from '@/core/auth/auth.controller';
import { AppointmentRequestsController } from '@/features/appointments/appointment-requests/appointment-requests.controller';
import { AppointmentsController } from '@/features/appointments/appointments.controller';
import { ClientController } from '@/features/client/client.controller';
import { FacilitiesController } from '@/features/facilities/facilities.controller';

// AuthGuard only enforces a token on routes carrying the authorize metadata;
// anything without it is public. These assertions pin which routes are
// allowed to be public so a new handler can't silently ship without auth.

type Controller = Type<unknown>;

const reflector = new Reflector();

function routeHandlers(controller: Controller) {
	const proto = controller.prototype as Record<string, unknown>;
	return Object.getOwnPropertyNames(proto)
		.filter((name) => name !== 'constructor')
		.map((name) => ({ name, handler: proto[name] }))
		.filter(
			({ handler }) =>
				typeof handler === 'function' &&
				Reflect.getMetadata(PATH_METADATA, handler) !== undefined,
		) as { name: string; handler: () => unknown }[];
}

function isAuthorized(controller: Controller, handler: () => unknown) {
	return (
		reflector.getAllAndOverride<boolean>(AUTHORIZE_KEY, [
			handler,
			controller,
		]) === true
	);
}

function publicRoutes(controller: Controller) {
	return routeHandlers(controller)
		.filter(({ handler }) => !isAuthorized(controller, handler))
		.map(({ name }) => name)
		.sort();
}

describe('route authorization', () => {
	it.each([
		['AppointmentsController', AppointmentsController],
		['AppointmentRequestsController', AppointmentRequestsController],
		['ClientController', ClientController],
	])('%s has no public routes', (_name, controller) => {
		expect(routeHandlers(controller).length).toBeGreaterThan(0);
		expect(publicRoutes(controller)).toEqual([]);
	});

	it('FacilitiesController only exposes reads publicly', () => {
		// Personnel onboarding picks a facility before it has a token.
		expect(publicRoutes(FacilitiesController)).toEqual(['findAll', 'findOne']);
	});

	it('AuthController only exposes signup publicly', () => {
		expect(publicRoutes(AuthController)).toEqual(['signup']);
	});
});
