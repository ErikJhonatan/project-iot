import "dotenv/config";
import express from "express";
import cors from "cors";
import five from "johnny-five";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MOCK_HARDWARE =
  String(process.env.MOCK_HARDWARE || "false").toLowerCase() === "true";

// Calibración del sensor (ajustar según hardware real)
const SENSOR_MIN = Number(process.env.SENSOR_MIN) || 0;
const SENSOR_MAX = Number(process.env.SENSOR_MAX) || 1023;

if (!GEMINI_API_KEY) {
  throw new Error("Falta la variable de entorno GEMINI_API_KEY");
}

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_DIR = __dirname;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const irrigationController = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  systemInstruction: [
    "Eres un controlador experto de riego llamado Greenvic-IA.",
    "Tu objetivo es interpretar comandos de voz/texto de operarios.",
    "Siempre responde ÚNICAMENTE en JSON válido y sin formateo markdown.",
    'Usa la estructura: { "intent": "activar_riego" | "desactivar_riego" | "consultar_humedad" | "otro", "response_text": "Texto corto para hablar" }.',
    'Elige la intención más adecuada. Usa "otro" si el comando no aplica.',
    "Sé conciso en response_text (máx 18 palabras).",
  ].join(" "),
});

let board;
let sensor;
let relay;
let boardReady = false;
let currentHumidity = null;
let pumpOn = false;
let mockHumidityTrend = 50;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const mapRawToPercent = (raw) => {
  // Mapeo lineal simple. Para sensores capacitivos reales, a menudo es inverso.
  // Aquí asumimos 0 = 0% y 1023 = 100% según requerimiento.
  const val = clamp(raw, SENSOR_MIN, SENSOR_MAX);
  const range = SENSOR_MAX - SENSOR_MIN;
  return Number((((val - SENSOR_MIN) / range) * 100).toFixed(1));
};

const ensureBoardReady = () => {
  if (!boardReady) {
    throw new Error("El hardware aún no está listo.");
  }
};

const updatePumpState = (shouldTurnOn) => {
  const newState = Boolean(shouldTurnOn);
  if (pumpOn !== newState) {
    console.log(`[Hardware] Bomba ${newState ? "ENCENDIDA" : "APAGADA"}`);
  }
  pumpOn = newState;
  if (relay) {
    if (pumpOn) {
      relay.on();
    } else {
      relay.off();
    }
  }
};

const startMockHardwareLoop = () => {
  boardReady = true;
  setInterval(() => {
    const delta = (Math.random() - 0.5) * 5;
    mockHumidityTrend = clamp(mockHumidityTrend + delta, 10, 90);
    currentHumidity = Number(mockHumidityTrend.toFixed(1));
  }, 1000);
};

const initializeHardware = () => {
  if (MOCK_HARDWARE) {
    console.info(
      "Johnny-Five en modo MOCK. No se comunicará con Arduino real."
    );
    startMockHardwareLoop();
    return;
  }

  board = new five.Board({
    repl: false,
    port: process.env.BOARD_SERIAL_PORT || undefined,
  });

  board.on("ready", () => {
    console.info("Board lista. Inicializando sensores...");
    sensor = new five.Sensor({ pin: "A0", freq: 1000 });
    relay = new five.Relay(7);

    sensor.on("data", function onSensorData() {
      currentHumidity = mapRawToPercent(this.value);
    });

    boardReady = true;
  });

  board.on("error", (err) => {
    console.error("Error en Johnny-Five:", err.message);
  });
};

initializeHardware();

const interpretCommand = async (text) => {
  const prompt = text?.trim();
  if (!prompt) {
    return { intent: "otro", response_text: "No entendí el comando" };
  }

  const result = await irrigationController.generateContent({
    generationConfig: { responseMimeType: "application/json" },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  });

  const rawText = result?.response?.text?.() ?? "";
  try {
    const parsed = JSON.parse(rawText);
    if (
      typeof parsed.intent !== "string" ||
      typeof parsed.response_text !== "string"
    ) {
      throw new Error("Respuesta incompleta");
    }
    return parsed;
  } catch (error) {
    console.warn("No se pudo parsear la respuesta de Gemini:", rawText);
    return { intent: "otro", response_text: "No comprendí la orden" };
  }
};

const readHumiditySnapshot = () => {
  if (currentHumidity === null) {
    throw new Error("Aún no hay lectura de humedad");
  }
  return currentHumidity;
};

app.use(express.static(STATIC_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.get("/status", (req, res) => {
  res.json({
    boardReady,
    humidity: currentHumidity,
    pumpOn,
  });
});

app.post("/command", async (req, res) => {
  try {
    const { command } = req.body || {};
    if (!command) {
      return res.status(400).json({ error: 'Falta el campo "command".' });
    }

    const { intent, response_text } = await interpretCommand(command);

    let humiditySnapshot = currentHumidity;

    switch (intent) {
      case "activar_riego":
        ensureBoardReady();
        updatePumpState(true);
        break;
      case "desactivar_riego":
      case "detener_riego":
        ensureBoardReady();
        updatePumpState(false);
        break;
      case "consultar_humedad":
        ensureBoardReady();
        humiditySnapshot = readHumiditySnapshot();
        break;
      default:
        break;
    }

    res.json({
      intent,
      response_text,
      pumpOn,
      humidity: humiditySnapshot,
      boardReady,
    });
  } catch (error) {
    const status = /hardware|lista|lectura/.test(error.message) ? 503 : 500;
    res.status(status).json({ error: error.message, pumpOn, boardReady });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const server = app.listen(PORT, () => {
  console.log(`Servidor Greenvic corriendo en http://localhost:${PORT}`);
});

const gracefulShutdown = () => {
  console.log("Cerrando servidor...");
  updatePumpState(false);
  server.close(() => process.exit(0));
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export { app };
