import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
	private logger = new Logger(FirebaseService.name);
	private baseApp: admin.app.App;
	private storageBucket: string;

	constructor(private configService: ConfigService) {
		const baseServiceAccount = {
			type: 'service_account',
			project_id: this.configService.get<string>('FIREBASE_BASE_PROJECT_ID'),
			private_key_id: this.configService.get<string>(
				'FIREBASE_BASE_PRIVATE_KEY_ID',
			),
			private_key: this.configService
				.get<string>('FIREBASE_BASE_PRIVATE_KEY')
				?.replace(/\\n/g, '\n'),
			client_email: this.configService.get<string>(
				'FIREBASE_BASE_CLIENT_EMAIL',
			),
			client_id: this.configService.get<string>('FIREBASE_BASE_CLIENT_ID'),
			auth_uri: 'https://accounts.google.com/o/oauth2/auth',
			token_uri: 'https://oauth2.googleapis.com/token',
			auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
			client_x509_cert_url: this.configService.get<string>(
				'FIREBASE_BASE_CLIENT_CERT_URL',
			),
			universe_domain: 'googleapis.com',
		};

		this.storageBucket = this.configService.get<string>('BASE_STORAGE_BUCKET')!;

		this.baseApp = admin.initializeApp(
			{
				credential: admin.credential.cert(
					baseServiceAccount as admin.ServiceAccount,
				),
				storageBucket: this.configService.get<string>('BASE_STORAGE_BUCKET'),
			},
			'database-app',
		);
	}

	get auth() {
		return this.baseApp.auth();
	}

	get db() {
		return this.baseApp.firestore();
	}

	get messaging() {
		return this.baseApp.messaging();
	}

	get firebaseStorage(): admin.storage.Storage {
		return this.baseApp.storage();
	}

	async verifyAsync(token: string) {
		try {
			const user = await this.auth.verifyIdToken(token);
			return user;
		} catch (error) {
			const name = error instanceof Error ? error.name : String(error);
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Authentication error occured: ${name} :: ${message}`);
			throw error;
		}
	}

	async retrieveDoc(collection: string, docId: string) {
		const docRef = this.db.collection(collection).doc(docId);
		const docSnap = await docRef.get();
		const doc = docSnap.data();
		if (!docSnap.exists || doc === undefined) {
			throw new NotFoundException('Document requested is not found');
		}
		return { doc, docRef };
	}

	async updateDoc(collection: string, docId: string, payload: Partial<object>) {
		try {
			const docRef = this.db.collection(collection).doc(docId);
			await docRef.update(payload);
			return;
		} catch (error: any) {
			this.logger.error(`Error updating document in ${collection} `, error);
		}
	}

	async uploadFile(
		file: Express.Multer.File,
		path: string,
		uuidToken?: string,
	) {
		const fileUpload = this.firebaseStorage
			.bucket(this.storageBucket)
			.file(`${path}/${file.originalname}`);
		uuidToken = uuidToken ?? crypto.randomUUID();

		await fileUpload.save(file.buffer, {
			metadata: {
				contentType: file.mimetype,
				contentDisposition: 'attachment',
				metadata: {
					firebaseStorageDownloadTokens: uuidToken,
				},
			},
		});
	}

	/**
	 * Deletes a file from Firebase Storage.
	 * @param url - The URL of the file to delete.
	 * @returns a promise that resolves when file is deleted.
	 * @throws {Error} if file is not found or api fails.
	 * @example
	 * // Deleting a specific file
	 * await this.firebaseService.deleteFile('https://firebasestorage.googleapis.com/v0/b/dh-base.appspot.com/o/chronic_care_chat_audios%2Fsession_123%2F2023-01-01T12:00:00.000Z.mp3?alt=media&token=123456789');
	 *
	 */
	async deleteFile(url: string) {
		try {
			const baseUrl = '/o/';
			const pathStart = url.indexOf(baseUrl) + baseUrl.length;
			const pathEnd = url.indexOf('?');

			const fullPath = decodeURIComponent(url.substring(pathStart, pathEnd));

			// Target the file in the bucket using the parsed path
			// this.configService.get<string>('BASE_STORAGE_BUCKET'),
			const file = this.firebaseStorage
				.bucket(this.storageBucket)
				.file(fullPath);

			await file.delete();

			console.log(`Successfully deleted: ${fullPath}`);
		} catch (error: any) {
			if (error.code === 404) {
				throw new Error('File already deleted or does not exist.');
			} else {
				throw error;
			}
		}
	}

	/**
	 * Deletes all files within a specific folder (prefix) in Firebase Storage.
	 * @remarks
	 * In Google Cloud Storage, folders are virtual. This method deletes all objects
	 * that start with the provided path string.
	 * @param folderPath - The path to the folder to delete (e.g., 'users/uploads').
	 * @returns A promise that resolves when all files are deleted.
	 * @throws Throws an error if the bucket is inaccessible or deletion fails.
	 * @example
	 * // Deleting a specific session's audio folder
	 * await storageService.deleteFolder('chronic_care_chat_audios/session_123');
	 */
	async deleteFolder(folderPath: string) {
		// Ensure the path ends with a forward slash to avoid
		// accidentally deleting "folder_backup" when you mean "folder/"
		const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;

		await this.firebaseStorage.bucket(this.storageBucket).deleteFiles({
			prefix: prefix,
			// Optional: set 'force' to true to ignore errors if the folder is empty
			force: true,
		});

		console.log(`Successfully deleted all contents in: ${prefix}`);
	}
}
