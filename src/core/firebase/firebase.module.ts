import { Global, Module } from '@nestjs/common';

import FirestoreRepository from './firebase.repository';
import { FirebaseService } from './firebase.service';

@Global()
@Module({
	providers: [FirebaseService, FirestoreRepository],
	exports: [FirebaseService, FirestoreRepository],
})
export class FirebaseModule {}
