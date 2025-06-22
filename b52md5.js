const Fastify = require("fastify");
const WebSocket = require("ws");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3010;
let b52LatestDice = null;       
let b52CurrentSession = null;   
let b52CurrentMD5 = null;       
let b52WS = null;
let b52IntervalCmd = null;
const b52ReconnectInterval = 5000;

let b52History = []; 


function calcResult(d1, d2, d3) {
  const total = d1 + d2 + d3;
  return total <= 10 ? "X" : "T";
}

function sendB52Cmd1005() {
  if (b52WS && b52WS.readyState === WebSocket.OPEN) {
    const payload = [6, "MiniGame", "taixiuKCBPlugin", { cmd: 2000 }];
    b52WS.send(JSON.stringify(payload));
  }
}

function connectB52WebSocket() {
  b52WS = new WebSocket("wss://minybordergs.weskb5gams.net/websocket");

  b52WS.on("open", () => {
    const authPayload = [
      1,
      "MiniGame",
      "",
      "",
      {
        agentId: "1",
        accessToken: "13-d8149f573c547b2f503353d96bf2fb81",
        reconnect: false,
      },
    ];
    b52WS.send(JSON.stringify(authPayload));
    clearInterval(b52IntervalCmd);
    b52IntervalCmd = setInterval(sendB52Cmd1005, 5000);
  });

  b52WS.on("message", (data) => {
  try {
    const json = JSON.parse(data);


    console.log("Received WebSocket data:", JSON.stringify(json).slice(0, 500)); 

    if (Array.isArray(json) && json[1]?.htr) {
  const htr = json[1].htr;


  const latestSessionId = htr[htr.length - 1]?.sid;
  console.log("Latest sessionId:", latestSessionId, "Current session:", b52CurrentSession);

  const forceUpdate = true;

  if (forceUpdate || !b52CurrentSession || latestSessionId > b52CurrentSession) {
    b52History = htr.slice(-6); 

    const latest = htr[htr.length - 1];
    if (
      latest &&
      typeof latest.d1 === "number" &&
      typeof latest.d2 === "number" &&
      typeof latest.d3 === "number" &&
      latest.sid
    ) {
      b52LatestDice = {
        d1: latest.d1,
        d2: latest.d2,
        d3: latest.d3,
      };
      b52CurrentSession = latest.sid;

      if (json[1].md5) {
        b52CurrentMD5 = json[1].md5;
      }

      console.log(
        `Updated latest dice: d1=${latest.d1}, d2=${latest.d2}, d3=${latest.d3}, session=${b52CurrentSession}`
      );
    }
  } else {
    console.log("Received session not newer, skipping update.");
  }
}
  } catch (e) {
    console.error("Error parsing WebSocket data:", e);
  }
});
  b52WS.on("close", () => {
    clearInterval(b52IntervalCmd);
    setTimeout(connectB52WebSocket, b52ReconnectInterval);
  });

  b52WS.on("error", (err) => {
    if (b52WS.readyState !== WebSocket.CLOSED) {
      b52WS.close();
    }
  });
}

connectB52WebSocket();

fastify.get("/api/b52", async (request, reply) => {
  if (!b52LatestDice || !b52CurrentSession) {
    return {
      current_dice: null,
      current_result: null,
      current_session: null,
      next_session: null,
      current_md5: b52CurrentMD5 || null,
      used_pattern: null,
    };
  }


  const diceValues = [b52LatestDice.d1, b52LatestDice.d2, b52LatestDice.d3];
  const sumDice = diceValues.reduce((a, b) => a + b, 0);


  const current_result = sumDice <= 10 ? "Xỉu" : "Tài";

  const used_pattern = b52History
    .map(({ d1, d2, d3 }) => calcResult(d1, d2, d3))
    .join("");

  return {
    current_dice: diceValues,
    current_result,
    current_session: b52CurrentSession,
    next_session: b52CurrentSession + 1,
    current_md5: b52CurrentMD5 || null,
    used_pattern,
  };
});

const start = async () => {
  try {
    const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server đang chạy tại ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();


