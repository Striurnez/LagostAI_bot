/**
 * memory/database.ts
 * Inicialización y conexión a Firebase Firestore.
 * Utiliza el SDK firebase-admin.
 */

import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

import { logger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';

// =============================================================================
// Estado global del módulo
// =============================================================================

let db: Firestore | null = null;
let dbInitialized = false;

// =============================================================================
// Inicialización
// =============================================================================

/**
 * Inicializa la app de Firebase usando la credencial (Service Account Key)
 * definida en GOOGLE_APPLICATION_CREDENTIALS.
 * 
 * Esta función DEBE llamarse una sola vez al inicio con await.
 */
export async function initDatabase(): Promise<void> {
  if (dbInitialized) return;

  try {
    // initializeApp otomatis usa la variable GOOGLE_APPLICATION_CREDENTIALS
    // si la pasamos como applicationDefault()
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });

    db = getFirestore();
    // Configurar Firestore para ignorar campos undefined
    db.settings({ ignoreUndefinedProperties: true });

    dbInitialized = true;
    logger.info('Firebase Firestore conectado exitosamente.');
  } catch (error) {
    throw new DatabaseError('No se pudo inicializar Firebase Firestore', error);
  }
}

/**
 * Obtiene la instancia de Firestore.
 * Lanza un error si la DB no fue inicializada con initDatabase().
 */
export function getDatabase(): Firestore {
  if (!db) {
    throw new DatabaseError(
      'Firestore no está inicializado. Llama a initDatabase() primero.',
    );
  }
  return db;
}

/**
 * Cierra la conexión (No estrictamente necesario en Firebase, pero mantenemos compatibilidad)
 */
export function closeDatabase(): void {
  if (db) {
    // Opcional: Para cerrar los WebSockets explícitamente si se requiere terminar el proceso abruptamente
    // db.terminate().catch(e => logger.error("Error terminando Firestore", e));
    db = null;
    dbInitialized = false;
    logger.info('Conexión de Firestore cerrada (lógicamente).');
  }
}
