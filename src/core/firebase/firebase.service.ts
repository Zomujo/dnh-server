import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { extname } from 'path';
import { CacheService } from '@/core/caching/caching.service';

const FIREBASE_STORAGE_HOST = 'https://firebasestorage.googleapis.com';
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const REVOCATION_CHECK_TTL_MS = 5 * 60 * 1000;

/** `.m4a`-style extension from a client filename, or '' if it isn't one. */
function safeExtension(originalname: string | undefined) {
	const ext = extname(originalname ?? '').toLowerCase();
	return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

@Injectable()
export class FirebaseService {
	private logger = new Logger(FirebaseService.name);
	private baseApp: admin.app.App;
	private storageBucket: string;

	constructor(
		private configService: ConfigService,
		private readonly verifiedTokenCache: CacheService<DecodedIdToken>,
	) {
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

	/**
	 * Verifies a Firebase ID token, including that the user still exists, is
	 * enabled, and hasn't had their tokens revoked. That check costs a
	 * Firebase round-trip, so a successful result is cached per token for at
	 * most REVOCATION_CHECK_TTL_MS: a deleted/disabled user loses access
	 * within that window instead of keeping it until the token's 1h expiry.
	 */
	async verifyAsync(token: string) {
		try {
			const cacheKey = `auth:firebase-verified:${createHash('sha256').update(token).digest('hex')}`;
			const cached = await this.verifiedTokenCache
				.get(cacheKey)
				.catch(() => null);
			if (cached) return cached;

			const user = await this.auth.verifyIdToken(token, true);

			const ttl = Math.min(
				REVOCATION_CHECK_TTL_MS,
				user.exp * 1000 - Date.now(),
			);
			if (ttl > 0) {
				await this.verifiedTokenCache
					.set(cacheKey, user, ttl)
					.catch((error) =>
						this.logger.warn(`Token cache write failed: ${error?.message}`),
					);
			}
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

	/**
	 * A fresh object path under `folder`. Server-generated, so two uploads
	 * that share an original filename can't overwrite each other, and the
	 * client filename never reaches the bucket path.
	 */
	newObjectPath(folder: string, originalname?: string) {
		return `${folder}/${crypto.randomUUID()}${safeExtension(originalname)}`;
	}

	/**
	 * Uploads to `objectPath` (see `newObjectPath`). No Firebase download
	 * token is attached: the object is only readable through short-lived
	 * signed URLs (see `signedUrlFor`).
	 * @returns the stored object's reference URL (not publicly readable).
	 */
	async uploadFile(file: Express.Multer.File, objectPath: string) {
		await this.firebaseStorage
			.bucket(this.storageBucket)
			.file(objectPath)
			.save(file.buffer, {
				metadata: {
					contentType: file.mimetype,
					contentDisposition: 'attachment',
				},
			});
		return this.objectUrl(objectPath);
	}

	/** Reference URL for an object in our bucket, without any access token. */
	objectUrl(objectPath: string) {
		return `${FIREBASE_STORAGE_HOST}/v0/b/${this.storageBucket}/o/${encodeURIComponent(objectPath)}`;
	}

	/**
	 * Object path for a Firebase Storage URL in our bucket, with or without a
	 * legacy `?alt=media&token=` suffix. Null for anything else.
	 */
	objectPathFromUrl(url: string): string | null {
		const prefix = `${FIREBASE_STORAGE_HOST}/v0/b/${this.storageBucket}/o/`;
		if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
		const encoded = url.slice(prefix.length).split('?')[0];
		return encoded ? decodeURIComponent(encoded) : null;
	}

	/**
	 * A V4 signed read URL for a stored media URL, valid for
	 * SIGNED_URL_TTL_MS. Values that aren't objects in our bucket (e.g. text
	 * content) are returned unchanged.
	 */
	async signedUrlFor(url: string): Promise<string> {
		const objectPath = this.objectPathFromUrl(url);
		if (!objectPath) return url;
		try {
			const [signed] = await this.firebaseStorage
				.bucket(this.storageBucket)
				.file(objectPath)
				.getSignedUrl({
					version: 'v4',
					action: 'read',
					expires: Date.now() + SIGNED_URL_TTL_MS,
				});
			return signed;
		} catch (error) {
			this.logger.error(`Failed to sign URL for ${objectPath}`, error);
			return url;
		}
	}

	/**
	 * Deletes a file from Firebase Storage.
	 * @param url - The stored URL of the file (with or without a legacy token).
	 * @returns a promise that resolves when file is deleted.
	 * @throws {Error} if file is not found or api fails.
	 */
	async deleteFile(url: string) {
		const fullPath = this.objectPathFromUrl(url);
		if (!fullPath) {
			throw new Error('Not a file in this storage bucket.');
		}
		try {
			await this.firebaseStorage
				.bucket(this.storageBucket)
				.file(fullPath)
				.delete();

			this.logger.log(`Successfully deleted: ${fullPath}`);
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
