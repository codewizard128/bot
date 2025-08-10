import express from "express";
import fetch from "node-fetch";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

// --- CONFIG ---
const TELEGRAM_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.0-flash";
const INACTIVITY_LIMIT_MINUTES = 60 * 24;
const MAX_HISTORY = 10;

const app = express();
app.use(express.json());

const bot = new TelegramBot(TELEGRAM_TOKEN, { webHook: true });
const chatHistories = {};
const lastMessageTime = {};

// Automatically set webhook to Render URL
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  bot.setWebHook(`${RENDER_URL}/bot${TELEGRAM_TOKEN}`);
  console.log(`Webhook set to ${RENDER_URL}/bot${TELEGRAM_TOKEN}`);
}

async function callGeminiChatWithModel(chatId, userMsg, model) {
  if (!chatHistories[chatId]) {
    chatHistories[chatId] = [
      {
        role: "user",
        text: `You are my Malayali girlfriend. Reply only in Manglish. Be loving, playful, caring, and realistic like a real girlfriend. Keep replies short, sweet, with warmth, teasing, humor, sass, mood swings, curiosity, and emotional depth.`
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
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Enthada? Njan confuse ayi 🤔";

  chatHistories[chatId].push({ role: "model", text: reply });
  if (chatHistories[chatId].length > MAX_HISTORY) {
    chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
  }

  return reply;
}

async function callGeminiChat(chatId, userMsg) {
  try {
    return await callGeminiChatWithModel(chatId, userMsg, PRIMARY_MODEL);
  } catch {
    return await callGeminiChatWithModel(chatId, userMsg, FALLBACK_MODEL);
  }
}

async function autoMessage(chatId) {
  const prompt = "Boyfriend is not messaging for a while. Send a cute Manglish 'miss you' message.";
  const reply = await callGeminiChat(chatId, prompt);
  await bot.sendMessage(chatId, reply);
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  // --- /reset command handler ---
  if (text.trim().toLowerCase() === "/reset") {
    chatHistories[chatId] = [];
    lastMessageTime[chatId] = Date.now();
    await bot.sendMessage(chatId, "Memory reset! We’re starting fresh ❤️");
    return;
  }

  lastMessageTime[chatId] = Date.now();
  const reply = await callGeminiChat(chatId, text);
  await bot.sendMessage(chatId, reply);
});

app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
