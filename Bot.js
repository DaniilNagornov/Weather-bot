require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- Predefined cities for quick-select buttons ---
const QUICK_CITIES = [
  ["🗽 New York", "🇬🇧 London"],
  ["🗼 Paris", "🇯🇵 Tokyo"],
  ["🏙️ Dubai", "🇦🇺 Sydney"],
];

// Map button labels to city names for API
const CITY_MAP = {
  "🗽 New York": "New York",
  "🇬🇧 London": "London",
  "🗼 Paris": "Paris",
  "🇯🇵 Tokyo": "Tokyo",
  "🏙️ Dubai": "Dubai",
  "🇦🇺 Sydney": "Sydney",
};

// --- Helper: get weather emoji ---
function getWeatherEmoji(code) {
  if (code <= 232) return "⛈️"; // Thunderstorm
  if (code <= 321) return "🌧️"; // Drizzle
  if (code <= 531) return "🌧️"; // Rain
  if (code <= 622) return "❄️"; // Snow
  if (code <= 781) return "🌪️"; // Atmosphere
  if (code === 800) return "☀️"; // Clear
  if (code <= 804) return "☁️"; // Clouds
  return "🌡️";
}

// --- Helper: fetch weather from OpenWeatherMap ---
async function getWeather(city) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;

  const res = await axios.get(url);
  const d = res.data;

  const emoji = getWeatherEmoji(d.weather[0].id);
  const temp = Math.round(d.main.temp);
  const feels = Math.round(d.main.feels_like);
  const humidity = d.main.humidity;
  const wind = d.wind.speed;
  const desc = d.weather[0].description;
  const sunrise = new Date(d.sys.sunrise * 1000).toUTCString().slice(17, 22);
  const sunset = new Date(d.sys.sunset * 1000).toUTCString().slice(17, 22);

  return (
    `${emoji} *Weather in ${d.name}, ${d.sys.country}*\n\n` +
    `📋 *Condition:* ${desc.charAt(0).toUpperCase() + desc.slice(1)}\n` +
    `🌡️ *Temperature:* ${temp}°C (feels like ${feels}°C)\n` +
    `💧 *Humidity:* ${humidity}%\n` +
    `💨 *Wind Speed:* ${wind} m/s\n` +
    `🌅 *Sunrise:* ${sunrise} UTC\n` +
    `🌇 *Sunset:* ${sunset} UTC`
  );
}

// --- Main menu keyboard ---
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

// Track users waiting to type a city
const awaitingCity = new Set();

// --- /start command ---
bot.onText(/\/start/, (msg) => {
  const name = msg.from.first_name || "there";
  bot.sendMessage(
    msg.chat.id,
    `👋 Hi *${name}*\\! I'm your *Weather Bot*\\.\n\nTap a city below to get the current weather, or search for any city in the world\\.`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: mainMenuKeyboard(),
    }
  );
});

// --- /weather command ---
bot.onText(/\/weather/, (msg) => {
  bot.sendMessage(msg.chat.id, "🌍 *Choose a city or search:*", {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
});

// --- Callback query handler (button clicks) ---
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  await bot.answerCallbackQuery(query.id);

  if (data === "search") {
    awaitingCity.add(chatId);
    await bot.sendMessage(
      chatId,
      "🔍 *Type the name of any city:*",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (data === "back") {
    await bot.editMessageText("🌍 *Choose a city or search:*", {
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
      await bot.editMessageText(weatherText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Refresh", callback_data: `city:${label}` }],
            [{ text: "⬅️ Back to cities", callback_data: "back" }],
          ],
        },
      });
    } catch (err) {
      await bot.editMessageText(
        `❌ Could not fetch weather for *${cityName}*. Please try again.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬅️ Back", callback_data: "back" }],
            ],
          },
        }
      );
    }
  }
});

// --- Handle free-text city search ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.text || msg.text.startsWith("/")) return;
  if (!awaitingCity.has(chatId)) return;

  awaitingCity.delete(chatId);
  const cityName = msg.text.trim();

  const loadingMsg = await bot.sendMessage(chatId, `⏳ Fetching weather for *${cityName}*...`, {
    parse_mode: "Markdown",
  });

  try {
    const weatherText = await getWeather(cityName);
    await bot.editMessageText(weatherText, {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: `city:${cityName}` }],
          [{ text: "🌍 Back to cities", callback_data: "back_new" }],
        ],
      },
    });
  } catch {
    await bot.editMessageText(
      `❌ Could not find weather for *${cityName}*\\. Check the city name and try again\\.`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Try again", callback_data: "search" }],
          ],
        },
      }
    );
  }
});

// Handle "back" from searched city
bot.on("callback_query", async (query) => {
  if (query.data === "back_new") {
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(query.message.chat.id, "🌍 *Choose a city or search:*", {
      parse_mode: "Markdown",
      reply_markup: mainMenuKeyboard(),
    });
  }
});

console.log("🌤️  Weather Bot is running...");
