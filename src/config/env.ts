/**
 * config/env.ts
 * Validación y tipado de variables de entorno.
 * Falla rápido si alguna variable requerida no existe.
 */

import 'dotenv/config';

// Interfaz con todas las variables de entorno del proyecto
export interface EnvConfig {
    // Telegram
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_ALLOWED_USER_IDS: string[];

    // LLM — Groq (principal)
    GROQ_API_KEY: string;
    GROQ_MODEL: string;

    // LLM — OpenRouter (fallback)
    OPENROUTER_API_KEY: string;
    OPENROUTER_MODEL: string;

    // Base de datos (Firebase)
    GOOGLE_APPLICATION_CREDENTIALS: string;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;

    // ElevenLabs (Voz)
    ELEVENLABS_API_KEY: string;
    ELEVENLABS_VOICE_ID: string;

    // Configuración del agente
    AGENT_MAX_ITERATIONS: number;
    LLM_TIMEOUT_MS: number;
    LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Obtiene y valida todas las variables de entorno requeridas.
 * Lanza un error descriptivo si alguna falta.
 */
function loadEnv(): EnvConfig {
    const required = [
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_ALLOWED_USER_IDS',
        'GROQ_API_KEY',
        'GROQ_MODEL',
        'OPENROUTER_API_KEY',
        'OPENROUTER_MODEL',
        'GOOGLE_APPLICATION_CREDENTIALS',
        'ELEVENLABS_API_KEY',
    ];

    // Verificar que todas las variables requeridas existan
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
        console.error('   Copia .env.example a .env y rellena los valores.');
        process.exit(1);
    }

    // Parsear IDs de usuario permitidos (lista separada por comas)
    const allowedIds = (process.env['TELEGRAM_ALLOWED_USER_IDS'] as string)
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

    if (allowedIds.length === 0) {
        console.error('❌ TELEGRAM_ALLOWED_USER_IDS no contiene IDs válidos.');
        process.exit(1);
    }

    // Parsear nivel de log con validación
    const rawLogLevel = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    const logLevel = validLogLevels.includes(rawLogLevel)
        ? (rawLogLevel as EnvConfig['LOG_LEVEL'])
        : 'info';

    return {
        TELEGRAM_BOT_TOKEN: process.env['TELEGRAM_BOT_TOKEN'] as string,
        TELEGRAM_ALLOWED_USER_IDS: allowedIds,
        GROQ_API_KEY: process.env['GROQ_API_KEY'] as string,
        GROQ_MODEL: process.env['GROQ_MODEL'] as string,
        OPENROUTER_API_KEY: process.env['OPENROUTER_API_KEY'] as string,
        OPENROUTER_MODEL: process.env['OPENROUTER_MODEL'] as string,
        GOOGLE_APPLICATION_CREDENTIALS: process.env['GOOGLE_APPLICATION_CREDENTIALS'] as string,
        FIREBASE_SERVICE_ACCOUNT_JSON: process.env['FIREBASE_SERVICE_ACCOUNT_JSON'],
        ELEVENLABS_API_KEY: process.env['ELEVENLABS_API_KEY'] as string,
        ELEVENLABS_VOICE_ID: process.env['ELEVENLABS_VOICE_ID'] ?? 'pNInz6obpg8nEmeWscDJ', // Adam (Default)
        AGENT_MAX_ITERATIONS: parseInt(process.env['AGENT_MAX_ITERATIONS'] ?? '10', 10),
        LLM_TIMEOUT_MS: parseInt(process.env['LLM_TIMEOUT_MS'] ?? '30000', 10),
        LOG_LEVEL: logLevel,
    };
}

// Exportar la configuración ya validada como singleton
export const env = loadEnv();
