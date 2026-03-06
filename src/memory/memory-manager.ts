/**
 * memory/memory-manager.ts
 * CRUD de memorias y historial de conversación migrado a Firebase Firestore.
 */

import { getDatabase } from './database.js';
import { logger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';

// =============================================================================
// Tipos
// =============================================================================

export interface Memory {
    id: string; // En Firestore los IDs suelen ser strings alfanuméricos
    user_id: string;
    type: string;
    content: string;
    metadata: string | null;
    created_at: string;
    updated_at: string;
}

export interface ConversationMessage {
    id: string; // Firestore ObjectId
    user_id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    created_at: string;
}

// Variables de colección
const MEMORIES_COLLECTION = 'memories';
const HISTORY_COLLECTION = 'conversation_history';

// =============================================================================
// Memorias
// =============================================================================

/**
 * Guarda una nueva memoria para el usuario.
 */
export async function saveMemory(
    userId: string,
    type: string,
    content: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    try {
        const db = getDatabase();
        const now = new Date().toISOString();

        await db.collection(MEMORIES_COLLECTION).add({
            user_id: userId,
            type: type,
            content: content,
            metadata: metadata ? JSON.stringify(metadata) : null,
            created_at: now,
            updated_at: now
        });

        logger.debug(`Memoria guardada para usuario ${userId}: "${content.slice(0, 50)}"`);
    } catch (error) {
        throw new DatabaseError('Error al guardar memoria en Firestore', error);
    }
}

/**
 * Obtiene las memorias más recientes del usuario.
 */
export async function getRecentMemories(userId: string, limit = 10): Promise<Memory[]> {
    try {
        const db = getDatabase();
        const snapshot = await db.collection(MEMORIES_COLLECTION)
            .where('user_id', '==', userId)
            // .orderBy('created_at', 'desc') -- Desactivado para evitar errores de índice compuesta en Vercel
            .limit(limit * 2) // Traemos un poco más para filtrar/ordenar en RAM
            .get();

        const memories = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Memory));

        // Ordenar en RAM de forma segura
        return memories.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    } catch (error) {
        throw new DatabaseError('Error al obtener memorias recientes en Firestore', error);
    }
}

/**
 * Busca memorias que contengan el término de búsqueda.
 * En Firestore no hay "LIKE %...%" nativo equivalente, por lo que buscamos
 * las memorias del usuario y filtramos en memoria RAM al ser un dataset pequeño.
 */
export async function searchMemories(userId: string, query: string): Promise<Memory[]> {
    try {
        const db = getDatabase();
        const snapshot = await db.collection(MEMORIES_COLLECTION)
            .where('user_id', '==', userId)
            // .orderBy('created_at', 'desc')
            .limit(100)
            .get();

        const searchTerm = query.toLowerCase();

        // Filtrado y ordenado en memoria
        const results = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Memory))
            .filter(m =>
                m.content.toLowerCase().includes(searchTerm) ||
                m.type.toLowerCase().includes(searchTerm)
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return results.slice(0, 5); // Limitado a 5 resultados útiles para el LLM
    } catch (error) {
        throw new DatabaseError('Error al buscar memorias en Firestore', error);
    }
}

/**
 * Elimina una memoria específica del usuario.
 */
export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
    try {
        const db = getDatabase();
        // Asegurarse de que el doc pertenece al usuario antes de borrar
        const docRef = db.collection(MEMORIES_COLLECTION).doc(memoryId);
        const doc = await docRef.get();

        if (doc.exists && doc.data()?.user_id === userId) {
            await docRef.delete();
        }
    } catch (error) {
        throw new DatabaseError('Error al eliminar memoria en Firestore', error);
    }
}

/**
 * Cuenta el total de memorias del usuario.
 */
export async function countMemories(userId: string): Promise<number> {
    try {
        const db = getDatabase();
        const snapshot = await db.collection(MEMORIES_COLLECTION)
            .where('user_id', '==', userId)
            .count()
            .get();

        return snapshot.data().count;
    } catch (error) {
        throw new DatabaseError('Error al contar memorias en Firestore', error);
    }
}

// =============================================================================
// Historial de Conversación
// =============================================================================

/**
 * Guarda un mensaje en el historial de conversación.
 */
export async function saveMessage(
    userId: string,
    role: ConversationMessage['role'],
    content: string,
): Promise<void> {
    try {
        const db = getDatabase();
        const now = new Date().toISOString();

        await db.collection(HISTORY_COLLECTION).add({
            user_id: userId,
            role: role,
            content: content,
            created_at: now
        });
    } catch (error) {
        throw new DatabaseError('Error al guardar mensaje en historial de Firestore', error);
    }
}

/**
 * Obtiene los últimos N mensajes del historial de conversación (en orden cronológico).
 */
export async function getConversationHistory(
    userId: string,
    limit = 20,
): Promise<ConversationMessage[]> {
    try {
        const db = getDatabase();
        const snapshot = await db.collection(HISTORY_COLLECTION)
            .where('user_id', '==', userId)
            // .orderBy('created_at', 'desc')
            .limit(limit)
            .get();

        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as ConversationMessage));

        // Ordenamos por timestamp cronológico (ascendente) para el LLM
        return messages.sort((a: ConversationMessage, b: ConversationMessage) => a.created_at.localeCompare(b.created_at));
    } catch (error) {
        throw new DatabaseError('Error al obtener historial de conversación en Firestore', error);
    }
}

/**
 * Elimina todo el historial de conversación del usuario.
 * Usado por el comando /clear.
 */
export async function clearHistory(userId: string): Promise<number> {
    try {
        const db = getDatabase();

        // Obtenemos todos los documentos del historial de este usuario
        const snapshot = await db.collection(HISTORY_COLLECTION)
            .where('user_id', '==', userId)
            .get();

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Ejecutamos el borrado en bloque (limitación de 500 max en Firestore batch, pero suficiente para el historial capado a ~20 por el bucle)
        if (snapshot.size > 0) {
            await batch.commit();
        }

        logger.info(`Historial eliminado en Firestore para usuario ${userId}: ${snapshot.size} mensajes`);
        return snapshot.size;
    } catch (error) {
        throw new DatabaseError('Error al limpiar historial de conversación en Firestore', error);
    }
}
