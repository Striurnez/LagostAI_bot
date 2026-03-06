/**
 * utils/errors.ts
 * Clases de error personalizadas para identificar fallos en cada capa.
 */

/**
 * Error base del proyecto — todos los errores propios extienden de aquí.
 */
export class AppError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'AppError';
    }
}

/**
 * Error de configuración — variable de entorno faltante o inválida.
 */
export class ConfigError extends AppError {
    constructor(message: string, cause?: unknown) {
        super(message, 'CONFIG_ERROR', cause);
        this.name = 'ConfigError';
    }
}

/**
 * Error del LLM — fallo en la llamada al proveedor de IA.
 */
export class LLMError extends AppError {
    constructor(
        message: string,
        public readonly provider: 'groq' | 'openrouter',
        public readonly statusCode?: number,
        cause?: unknown,
    ) {
        super(message, 'LLM_ERROR', cause);
        this.name = 'LLMError';
    }
}

/**
 * Error de herramienta — fallo en la ejecución de una tool.
 */
export class ToolError extends AppError {
    constructor(
        message: string,
        public readonly toolName: string,
        cause?: unknown,
    ) {
        super(message, 'TOOL_ERROR', cause);
        this.name = 'ToolError';
    }
}

/**
 * Error del agent loop — se alcanzó el límite de iteraciones u otro fallo del agente.
 */
export class AgentError extends AppError {
    constructor(message: string, cause?: unknown) {
        super(message, 'AGENT_ERROR', cause);
        this.name = 'AgentError';
    }
}

/**
 * Error de base de datos — fallo al leer o escribir en SQLite.
 */
export class DatabaseError extends AppError {
    constructor(message: string, cause?: unknown) {
        super(message, 'DATABASE_ERROR', cause);
        this.name = 'DatabaseError';
    }
}

/**
 * Error de autorización — usuario no autorizado intentó usar el bot.
 */
export class AuthError extends AppError {
    constructor(message: string, public readonly userId?: number) {
        super(message, 'AUTH_ERROR');
        this.name = 'AuthError';
    }
}
