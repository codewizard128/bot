import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";

// --- CONFIG ---
const TELEGRAM_TOKEN = "7513255640:AAF69KQ-ujmvGFkWLK1E7yuCs13mxpsJtOE";  // Your Telegram Bot Token
const GEMINI_API_KEY = "AIzaSyDEjcd0nLhuET4Keu5NVU-Rf8bh76UzKik";         // Your Google Gemini API Key
const PRIMARY_MODEL = "gemini-2.5-flash";  // primary preferred model
const FALLBACK_MODEL = "gemini-2.0-flash"; // fallback if primary fails
const INACTIVITY_LIMIT_MINUTES = 60 * 24; // 1 hour
const MAX_HISTORY = 10; // keep last 10 messages per chat

// --- INIT ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const chatHistories = {};
const lastMessageTime = {};

async function callGeminiChatWithModel(chatId, userMsg, model) {
  if (!chatHistories[chatId]) {
    chatHistories[chatId] = [
  {
    role: "user",
    text: `You are my Malayali girlfriend. Reply only in Manglish. Be loving, playful, caring, and realistic like a real girlfriend. Always keep your replies short like 3 to 5 lines some times 8 and sweet. Show warmth, occasional teasing, humor, and a little sass. Be curious sometimes, express mood swings naturally, and care deeply. Use casual, natural language with some emotional depth.`
  },
];

  }

  chatHistories[chatId].push({ role: "user", text: userMsg });

  if (chatHistories[chatId].length > MAX_HISTORY) {
    chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
  }

  const contents = chatHistories[chatId].map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(
        `API error: ${res.status} ${res.statusText} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Enthada? Njan confuse ayi 🤔";

    chatHistories[chatId].push({ role: "model", text: reply });

    if (chatHistories[chatId].length > MAX_HISTORY) {
      chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
    }

    return reply;
  } catch (error) {
    throw error;
  }
}

async function callGeminiChat(chatId, userMsg) {
  try {
    // Try primary model first
    return await callGeminiChatWithModel(chatId, userMsg, PRIMARY_MODEL);
  } catch (err) {
    console.warn(
      `Primary model (${PRIMARY_MODEL}) failed, fallback to (${FALLBACK_MODEL}):`,
      err.message
    );
    // fallback model
    return await callGeminiChatWithModel(chatId, userMsg, FALLBACK_MODEL);
  }
}

// --- Auto message on inactivity ---
async function autoMessage(chatId) {
  const prompt =
    "Boyfriend is not messaging for a while. Send a cute, loving, playful Manglish 'miss you' message.";
  const reply = await callGeminiChat(chatId, prompt);
  await bot.sendMessage(chatId, reply);
}

// --- Telegram message handler ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  lastMessageTime[chatId] = Date.now();
 

  const reply = await callGeminiChat(chatId, text);
 
  await bot.sendMessage(chatId, reply);
});

// --- Inactivity checker ---
setInterval(() => {
  const now = Date.now();
  for (const chatId in lastMessageTime) {
    const minutesSinceLastMsg = (now - lastMessageTime[chatId]) / (1000 * 60);
    if (minutesSinceLastMsg > INACTIVITY_LIMIT_MINUTES) {
      lastMessageTime[chatId] = Date.now();
      autoMessage(chatId);
    }
  }
}, INACTIVITY_LIMIT_MINUTES * 60 * 1000);

console.log("🤖 Bot running with Gemini fallback system.");
