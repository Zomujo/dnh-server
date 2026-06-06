import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

import { FirebaseService } from './firebase.service';

@Injectable()
class FirestoreRepository {
	private logger = new Logger(FirestoreRepository.name);
	private db: admin.firestore.Firestore;

	constructor(private firebaseService: FirebaseService) {
		this.db = this.firebaseService.db;
	}

	async addDocument(
		collectionName: string,
		payload: FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>,
	) {
		try {
			const docRef = await this.db.collection(collectionName).add(payload);
			return { id: docRef.id, ...payload };
		} catch (error) {
			this.logger.error('Error adding document: ', error);
			throw error;
		}
	}

	async addDocumentWithId(
		collectionName: string,
		id: string,
		payload: FirebaseFirestore.WithFieldValue<FirebaseFirestore.DocumentData>,
	) {
		try {
			const docRef = this.db.collection(collectionName).doc(id);
			await docRef.set(payload);
			return { id, ...payload };
		} catch (error) {
			this.logger.error(
				`Error adding document with custom ID: ${id} in collection : ${collectionName}`,
				error,
			);
			throw error;
		}
	}

	async getAllDocuments(collectionName: string) {
		try {
			const snapshot = await this.db.collection(collectionName).get();
			return snapshot.docs.map((doc) => doc.data());
		} catch (error) {
			this.logger.error('Error fetching documents: ', error);
			throw error;
		}
	}

	async getDocumentById(collectionName: string, id: string) {
		try {
			const doc = await this.db.collection(collectionName).doc(id).get();
			if (!doc.exists) return null;
			return doc;
		} catch (error) {
			this.logger.error('Error fetching document: ', error);
			throw error;
		}
	}

	async getDocumentsBy(collectionName: string, filters: Record<string, any>) {
		try {
			let query: admin.firestore.Query = this.db.collection(collectionName);
			for (const [field, value] of Object.entries(filters)) {
				query = query.where(field, '==', value);
			}

			const snapshot = await query.get();
			if (snapshot.empty) return [];

			return snapshot.docs;
		} catch (error) {
			this.logger.error('Error fetching filtered documents: ', error);
			throw error;
		}
	}

	async getDocumentBy(collectionName: string, filters: Record<string, any>) {
		try {
			let query: admin.firestore.Query = this.db.collection(collectionName);
			for (const [field, value] of Object.entries(filters)) {
				query = query.where(field, '==', value);
			}

			const snapshot = await query.limit(1).get();
			if (snapshot.empty) return null;

			const doc = snapshot.docs[0];
			return doc;
		} catch (error) {
			this.logger.error('Error fetching document by filters: ', error);
			throw error;
		}
	}

	async updateDocument(
		collectionName: string,
		id: string,
		updatedData: Record<string, any>,
	) {
		try {
			await this.db.collection(collectionName).doc(id).update(updatedData);
			return { id, ...updatedData };
		} catch (error) {
			this.logger.error('Error updating document: ', error);
			throw error;
		}
	}

	async deleteDocument(collectionName: string, id: string) {
		try {
			await this.db.collection(collectionName).doc(id).delete();
			return { success: true };
		} catch (error) {
			this.logger.error('Error deleting document: ', error);
			throw error;
		}
	}
}

export default FirestoreRepository;
