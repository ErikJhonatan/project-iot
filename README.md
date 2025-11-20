# Greenvic Smart Irrigation Server

Servidor Express + Johnny-Five que controla un sistema de riego basado en Arduino UNO y se integra con Gemini para interpretar comandos naturales.

## Requisitos

- Node.js 18+
- Arduino UNO con Firmata cargado (para uso real)
- API Key de Google Gemini

## Configuración

1. Instala dependencias:

```bash
npm install
```

2. Copia el archivo `.env` (o ajusta sus valores):

```
PORT=3000
GEMINI_API_KEY=TU_API_KEY_DE_GEMINI
GEMINI_MODEL=gemini-1.5-flash
MOCK_HARDWARE=true
BOARD_SERIAL_PORT=/dev/ttyACM0
```

- Coloca `MOCK_HARDWARE=false` cuando conectes el Arduino real.
- Ajusta `BOARD_SERIAL_PORT` si Johnny-Five no detecta el puerto automáticamente.

## Uso

- Desarrollo con recarga:

```bash
npm run dev
```

- Producción:

```bash
npm start
```

## Endpoints

- `GET /status`: Devuelve `{ boardReady, humidity, pumpOn }`.
- `POST /command`: Recibe `{ "command": "texto" }`, consulta Gemini y ejecuta acciones en el hardware. Responde con `{ intent, response_text, pumpOn, humidity, boardReady }`.

## Hardware

- Sensor capacitivo de humedad en `A0`.
- Relé de la bomba en `D7`.

Asegúrate de cargar Firmata Standard en el Arduino con el IDE antes de iniciar el servidor en modo real.

## Cambios de comportamiento

Solo `public/` se sirve como contenido estático. Importar `server.js` no abre HTTP ni inicializa hardware; `startServer()` y `stopServer()` gestionan su ciclo de vida. La calibración exige valores finitos y `SENSOR_MAX > SENSOR_MIN`. Los comandos deben ser texto no vacío de hasta 1000 caracteres.
