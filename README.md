# LasgostAI Bot 🤖

Agente de IA personal vía Telegram, construido desde cero con Node.js + TypeScript. Motor de razonamiento: **Groq** (con fallback automático a **OpenRouter**). Memoria persistente en **SQLite**.

---

## Características

- 🧠 **Agent Loop ReAct** — Razona → Actúa → Observa (hasta 10 iteraciones por mensaje)
- 🔄 **Fallback automático** — Si Groq alcanza rate limits, cambia a OpenRouter sin interrupciones
- 💾 **Memoria persistente** — SQLite local para historial y memorias del usuario
- 🛠️ **Sistema de herramientas extensible** — Añade tools sin tocar el código del agente
- 🔒 **Whitelist de usuarios** — Solo tú (y quien configures) puede usar el bot
- 🚀 **Long polling** — Sin webhooks ni servidor web, funciona desde tu máquina local

---

## Requisitos

- [Node.js](https://nodejs.org) v18 o superior
- Una cuenta de [Telegram](https://telegram.org) con un bot creado vía [@BotFather](https://t.me/BotFather)
- API key de [Groq](https://console.groq.com) (gratuito con tier generoso)
- API key de [OpenRouter](https://openrouter.ai) (gratuito con modelos free)

---

## Setup Rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales reales:

| Variable | Dónde obtenerla |
|---|---|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` |
| `TELEGRAM_ALLOWED_USER_IDS` | [@userinfobot](https://t.me/userinfobot) → tu ID |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |

### 3. Ejecutar en modo desarrollo

```bash
npm run dev
```

Verás algo similar a:
```
2025-01-15T14:30:00.000Z [INFO] Base de datos inicializada en: ./data/memory.db
2025-01-15T14:30:00.000Z [INFO] Herramientas registradas correctamente
2025-01-15T14:30:01.000Z [INFO] ✅ Bot activo: @TuBot (ID: 123456789)
2025-01-15T14:30:01.000Z [INFO] Esperando mensajes...
```

---

## Comandos del Bot

| Comando | Descripción |
|---|---|
| `/start` | Bienvenida e introducción |
| `/help` | Lista de comandos |
| `/clear` | Borrar historial de conversación |
| `/memory` | Ver memorias guardadas |
| `/status` | Uptime y estadísticas del bot |

---

## Añadir Nuevas Herramientas

1. Crea un archivo en `src/tools/implementations/mi-tool.ts`:

```typescript
import type { Tool } from '../tool.interface.js';

export const miTool: Tool = {
  name: 'mi_tool',
  description: 'Descripción para el LLM sobre cuándo usar esta tool',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Descripción del parámetro' },
    },
    required: ['param1'],
  },
  async execute(args) {
    const { param1 } = args as { param1: string };
    return `Resultado de mi tool con: ${param1}`;
  },
};
```

2. Regístrala en `src/index.ts`:

```typescript
import { miTool } from './tools/implementations/mi-tool.js';
// ...
registerTool(miTool);
```

¡Listo! El agente ya puede usar tu nueva herramienta.

---

## Estructura del Proyecto

```
lasgost-ai-bot/
├── src/
│   ├── index.ts              # Entry point
│   ├── agent/
│   │   ├── agent-loop.ts     # Bucle ReAct principal
│   │   ├── llm.ts            # Groq + OpenRouter
│   │   └── prompt.ts         # System prompt
│   ├── bot/
│   │   ├── telegram.ts       # Grammy + handlers
│   │   └── middleware.ts     # Autenticación whitelist
│   ├── config/
│   │   └── env.ts            # Validación de entorno
│   ├── memory/
│   │   ├── database.ts       # SQLite singleton
│   │   └── memory-manager.ts # CRUD memoria
│   ├── tools/
│   │   ├── tool.interface.ts # Interfaz base
│   │   ├── registry.ts       # Registro de tools
│   │   └── implementations/  # Tools incluidas
│   └── utils/
│       ├── logger.ts         # Logger con niveles
│       └── errors.ts         # Clases de error
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## Scripts

```bash
npm run dev        # Modo desarrollo con hot-reload (tsx watch)
npm start          # Producción
npm run build      # Compilar TypeScript a dist/
npm run typecheck  # Verificar tipos sin compilar
```

---

## Seguridad

- ✅ Solo usuarios en la whitelist pueden interactuar con el bot
- ✅ Tokens y API keys nunca aparecen en logs
- ✅ Todas las queries SQLite usan prepared statements
- ✅ Mensajes limitados a 4096 caracteres
- ✅ Herramientas solo se registran en código, nunca dinámicamente
- ✅ El bot nunca crashea — todos los errores están controlados con try/catch

---

## Licencia

MIT — Úsalo, modifícalo, hazlo tuyo.
