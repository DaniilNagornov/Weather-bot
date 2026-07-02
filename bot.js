require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const QUICK_CITIES = [
  ["🗽 New York", "🇬🇧 London"],
  ["🗼 Paris", "🇯🇵 Tokyo"],
  ["🏙️ Dubai", "🇦🇺 Sydney"],
];

const CITY_MAP = {
  "🗽 New York": "New York",
  "🇬🇧 London": "London",
  "🗼 Paris": "Paris",
  "🇯🇵 Tokyo": "Tokyo",
  "🏙️ Dubai": "Dubai",
  "🇦🇺 Sydney": "Sydney",
};

function getWeatherEmoji(code) {
  if (code <= 232) return "⛈️";
  if (code <= 321) return "🌧️";
  if (code <= 531) return "🌧️";
  if (code <= 622) return "❄️";
  if (code <= 781) return "🌪️";
  if (code === 800) return "☀️";
  if (code <= 804) return "☁️";
  return "🌡️";
}

async function getWeather(city) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
  const res = await axios.get(url);
  const d = res.data;
  const emoji = getWeatherEmoji(d.weather[0].id);
  const temp = Math.round(d.main.temp);
  const feels = Math.round(d.main.feels_like);
  const desc = d.weather[0].description;
  return (
    `${emoji} *Weather in ${d.name}, ${d.sys.country}*\n\n` +
    `📋 *Condition:* ${desc.charAt(0).toUpperCase() + desc.slice(1)}\n` +
    `🌡️ *Temperature:* ${temp}°C (feels like ${feels}°C)\n` +
    `💧 *Humidity:* ${d.main.humidity}%\n` +
    `💨 *Wind:* ${d.wind.speed} m/s`
  );
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      ...QUICK_CITIES.map((row) =>
        row.map((city) => ({ text: city, callback_data: `city:${city}` }))
      ),
      [{ text: "🔍 Search a city", callback_data: "search" }],
    ],
  };
}

const awaitingCity = new Set();

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Hi! Tap a city to get the weather:", {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  if (data === "search") {
    awaitingCity.add(chatId);
    bot.sendMessage(chatId, "🔍 Type any city name:");
    return;
  }

  if (data === "back") {
    bot.editMessageText("🌍 Choose a city:", {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  if (data.startsWith("city:")) {
    const label = data.replace("city:", "");
    const cityName = CITY_MAP[label] || label;
    try {
      const weatherText = await getWeather(cityName);
      bot.editMessageText(weatherText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Refresh", callback_data: `city:${label}` }],
            [{ text: "⬅️ Back", callback_data: "back" }],
          ],
        },
      });
    } catch {
      bot.editMessageText("❌ City not found. Try again.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "back" }]] },
      });
    }
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text || msg.text.startsWith("/")) return;
  if (!awaitingCity.has(chatId)) return;
  awaitingCity.delete(chatId);
  const cityName = msg.text.trim();
  try {
    const weatherText = await getWeather(cityName);
    bot.sendMessage(chatId, weatherText, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `city:${cityName}` }],
          [{ text: "🌍 Main menu", callback_data: "back" }],
        ],
      },
    });
  } catch {
    bot.sendMessage(chatId, "❌ City not found. Try again.", {
      reply_markup: { inline_keyboard: [[{ text: "🔍 Search again", callback_data: "search" }]] },
    });
  }
});

console.log("🌤️ Weather Bot is running...");
