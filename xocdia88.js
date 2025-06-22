const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3011;

let currentResult = null;
let currentSession = null;
let lastDiceString = "";
let lastPattern = [];

let ws = null;

function connectWebSocket() {
  const socketUrl = "wss://taixiu.system32-cloudfare-356783752985678522.monster/signalr/reconnect?transport=webSockets&connectionToken=KPp0BK5gnTFtNwpF8e22fw6EjbVEGciXoGqmzZ5poNFueRXIaXr%2B%2FUfUIUK8qEeP6JLpIZwEUlyWiZsJhk0dznrP7klq3PQESirEpi%2BJIhQhkyXQ9KpBcKKLOaKsI22r&connectionData=%5B%7B%22name%22%3A%22luckydiceHub%22%7D%5D&tid=12&access_token=05%2F7JlwSPGzEp7KB65%2Bwde9%2F%2FOg9Bt5qB3UwDAmuWFIAloKmkwFt5TKrdXki%2FA%2B%2FQ9OqNWJEO9gAXj5rEPv8ESypPJ9tU%2BX49DMQaSJw63zPy%2FieT76nWz25ex%2BvLK2iROwJVIS1QehEEhQ7SUjmWKgbLacm8%2FSPxi41u4lThdXpPBsJ6K5iFma2WaGr%2B64ufdPRYGqOdZSvng3exArY7r3h1HVK8PCdBuD%2FgmwxonllUyYNs8YAgHEjq1ymrouJKvrPoE2gKEvoAjL5NQ33E%2BoG5Dt%2FJb2jou%2B7aUktzyvdwPJKqzaR3qFSMwo7dc6JUmrHKM0w84DeU0axUeaLX9VHzBo2%2B9cZ%2FBtvcNbKOh8aSKrK1iiAOKr38VKcYdZcw40hrcDpqIg%3D.b7e51a48409f979c8804b90cd81b27ccc012c2c8eef2c4a9ed810c2fe92d2ef1";

  ws = new WebSocket(socketUrl);

  ws.on("open", () => {
    console.log("✅ Đã kết nối WebSocket LuckyDice");
  });

  ws.on("message", (data) => {
    try {
      const json = JSON.parse(data);

      if (json.M && Array.isArray(json.M)) {
        json.M.forEach((msg) => {
          if (
            msg.H === "luckydiceHub" &&
            msg.M === "sessionInfo" &&
            Array.isArray(msg.A)
          ) {
            const session = msg.A[0];
            const sid = session.SessionID;
            const d1 = session.Result?.Dice1;
            const d2 = session.Result?.Dice2;
            const d3 = session.Result?.Dice3;

            if ([d1, d2, d3].includes(-1)) return;

            const diceString = `${d1},${d2},${d3}`;

            if (sid !== currentSession || diceString !== lastDiceString) {
              currentSession = sid;
              lastDiceString = diceString;

              const sum = d1 + d2 + d3;
              currentResult = sum >= 11 ? "Tài" : "Xỉu";

              lastPattern.unshift(currentResult === "Tài" ? "T" : "X");
              if (lastPattern.length > 6) lastPattern.pop();

              console.log(`Phiên: ${sid} - Dice: ${d1},${d2},${d3} = ${sum} → ${currentResult}`);
            }
          }
        });
      }
    } catch (e) {
      // im lặng lỗi
    }
  });

  ws.on("close", () => {
    console.warn("🔌 WebSocket bị đóng. Đang thử kết nối lại...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", (err) => {
    console.error("❌ Lỗi WebSocket:", err.message);
    ws.close();
  });
}

connectWebSocket();

fastify.get("/api/luckydice", async (request, reply) => {
  if (!currentResult || !currentSession) {
    return {
      current_result: null,
      current_session: null,
      next_session: null,
      prediction: null,
      used_pattern: "",
    };
  }

  return {
    current_result: currentResult,
    current_session: currentSession,
    next_session: currentSession + 1,
    prediction: currentResult === "Tài" ? "Xỉu" : "Tài",
    used_pattern: lastPattern.slice(0, 6).reverse().join(""),
  };
});

const start = async () => {
  try {
    const addr = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🎲 LuckyDice API đang chạy tại ${addr}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();