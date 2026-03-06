/**
 * tools/implementations/get-current-time.ts
 * Herramienta que retorna la fecha y hora actual del sistema.
 * Ejemplo de implementación mínima de una Tool.
 */

import type { Tool } from '../tool.interface.js';

export const getCurrentTimeTool: Tool = {
    name: 'get_current_time',

    description:
        'Obtiene la fecha y hora actual del sistema. Úsala cuando el usuario pregunte ' +
        'por la hora, la fecha, el día de la semana, etc.',

    parameters: {
        type: 'object',
        properties: {},
        required: [],
    },

    async execute(_args: Record<string, unknown>): Promise<string> {
        const now = new Date();

        // Obtener offset de zona horaria del sistema
        const offsetMinutes = now.getTimezoneOffset();
        const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
        const offsetMins = Math.abs(offsetMinutes % 60);
        const offsetSign = offsetMinutes <= 0 ? '+' : '-';
        const offsetStr = `UTC${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

        // Formatear la respuesta
        const isoString = now.toISOString();
        const localString = now.toLocaleString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        return `${isoString} (${offsetStr})\nFecha local: ${localString}`;
    },
};
