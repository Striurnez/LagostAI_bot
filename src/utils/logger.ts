/**
 * utils/logger.ts
 * Logger simple con niveles y timestamps.
 * Configurable vía la variable de entorno LOG_LEVEL.
 */

// Niveles de log en orden de severidad
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

// Colores ANSI para la consola
const COLORS = {
    debug: '\x1b[36m', // Cian
    info: '\x1b[32m',  // Verde
    warn: '\x1b[33m',  // Amarillo
    error: '\x1b[31m', // Rojo
    reset: '\x1b[0m',
};

/**
 * Genera la cadena de timestamp actual en formato legible.
 */
function getTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Determina el nivel mínimo de log configurado.
 * Se lee directamente de process.env para evitar dependencias circulares.
 */
function getMinLevel(): number {
    const level = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase() as LogLevel;
    return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

/**
 * Función principal de logging.
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVELS[level] < getMinLevel()) return;

    const timestamp = getTimestamp();
    const prefix = `${COLORS[level]}[${level.toUpperCase()}]${COLORS.reset}`;
    const line = `${timestamp} ${prefix} ${message}`;

    if (level === 'error') {
        console.error(line, ...args);
    } else if (level === 'warn') {
        console.warn(line, ...args);
    } else {
        console.log(line, ...args);
    }
}

// Exportar el logger con métodos por nivel
export const logger = {
    debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
    info: (message: string, ...args: unknown[]) => log('info', message, ...args),
    warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
    error: (message: string, ...args: unknown[]) => log('error', message, ...args),
};
