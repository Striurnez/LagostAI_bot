/**
 * memory/database.ts
 * Inicialización y conexión a Firebase Firestore.
 * Utiliza el SDK firebase-admin.
 */

import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

import { env } from '../config/env.js';
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
    // 1. Decidir método de autenticación
    let credential;
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      logger.info('Usando credenciales Firebase desde variable de entorno (JSON).');
      credential = admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else {
      logger.info('Usando credenciales Firebase locales (vía ARCHIVO .json).');
      credential = admin.credential.applicationDefault();
    }

    // 2. Inicializar App
    admin.initializeApp({ credential });

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
