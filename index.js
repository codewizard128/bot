// index.js
import express from "express";
import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// --- CONFIG ---
const TELEGRAM_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const INACTIVITY_LIMIT_MINUTES = 60 * 24;
const MAX_HISTORY = 10;
const RENDER_APP_NAME = "vibemate"; // hardcoded Render app name

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
  console.error("❌ BOT_TOKEN and GEMINI_API_KEY must be set in environment variables.");
  process.exit(1);
}

const app = express();
app.use(express.json());

// --- INIT ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: true });
const chatHistories = {};
const lastMessageTime = {};

// --- Gemini Chat ---
async function callGeminiChatWithModel(chatId, userMsg, model) {
  if (!chatHistories[chatId]) {
    chatHistories[chatId] = [
      {
        role: "user",
        text: `You are my Malayali girlfriend. Reply only in Manglish. Be loving, playful, caring, and realistic like a real girlfriend. Always keep your replies short like 3 to 5 lines some times 8 and sweet. Show warmth, occasional teasing, humor, and a little sass. Be curious sometimes, express mood swings naturally, and care deeply. Use casual, natural language with some emotional depth.`
      }
    ];
  }

  chatHistories[chatId].push({ role: "user", text: userMsg });
  if (chatHistories[chatId].length > MAX_HISTORY) {
    chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
  }

  const contents = chatHistories[chatId].map(m => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

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
  const reply =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Enthada? Njan confuse ayi 🤔";

  chatHistories[chatId].push({ role: "model", text: reply });
  if (chatHistories[chatId].length > MAX_HISTORY) {
    chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
  }

  return reply;
}

async function callGeminiChat(chatId, userMsg) {
  try {
    return await callGeminiChatWithModel(chatId, userMsg, PRIMARY_MODEL);
  } catch (err) {
    console.warn(
      `Primary model failed, fallback to ${FALLBACK_MODEL}:`,
      err.message
    );
    return await callGeminiChatWithModel(chatId, userMsg, FALLBACK_MODEL);
  }
}

// --- Auto Message ---
async function autoMessage(chatId) {
  const prompt =
    "Boyfriend is not messaging for a while. Send a cute, loving, playful Manglish 'miss you' message.";
  const reply = await callGeminiChat(chatId, prompt);
  await bot.sendMessage(chatId, reply);
}

// --- Telegram Handlers ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  lastMessageTime[chatId] = Date.now();
  const reply = await callGeminiChat(chatId, text);
  await bot.sendMessage(chatId, reply);
});

// --- Inactivity Checker ---
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

// --- Webhook Endpoint ---
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// --- Auto Webhook Registration ---
app.listen(process.env.PORT || 3000, async () => {
  try {
    const publicUrl = `https://${RENDER_APP_NAME}.onrender.com`;
    await bot.setWebHook(`${publicUrl}/bot${TELEGRAM_TOKEN}`);
    console.log(`✅ Bot webhook set to: ${publicUrl}/bot${TELEGRAM_TOKEN}`);
    console.log(`🚀 Bot running on port ${process.env.PORT || 3000}`);
  } catch (err) {
    console.error("❌ Failed to set webhook:", err.message);
  }
});
