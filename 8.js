const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ============================================================================
// ULTRA DICE PREDICTION SYSTEM - PHẢI ĐẶT TRƯỚC KHI SỬ DỤNG
// ============================================================================

class UltraDicePredictionSystem {
    constructor() {
        this.history = [];
        this.models = {};
        this.weights = {};
        this.performance = {};
        this.patternDatabase = {};
        this.advancedPatterns = {};
        this.sessionStats = {
            streaks: { T: 0, X: 0, maxT: 0, maxX: 0 },
            transitions: { TtoT: 0, TtoX: 0, XtoT: 0, XtoX: 0 },
            volatility: 0.5,
            patternConfidence: {},
            recentAccuracy: 0,
            bias: { T: 0, X: 0 }
        };
        this.marketState = {
            trend: 'neutral',
            momentum: 0,
            stability: 0.5,
            regime: 'normal'
        };
        this.adaptiveParameters = {
            patternMinLength: 3,
            patternMaxLength: 8,
            volatilityThreshold: 0.7,
            trendStrengthThreshold: 0.6,
            patternConfidenceDecay: 0.95,
            patternConfidenceGrowth: 1.05
        };
        this.initAllModels();
    }

    initAllModels() {
        for (let i = 1; i <= 21; i++) {
            this.models[`model${i}`] = this[`model${i}`].bind(this);
            this.models[`model${i}Mini`] = this[`model${i}Mini`].bind(this);
            this.models[`model${i}Support1`] = this[`model${i}Support1`].bind(this);
            this.models[`model${i}Support2`] = this[`model${i}Support2`].bind(this);
            
            this.weights[`model${i}`] = 1;
            this.performance[`model${i}`] = { 
                correct: 0, 
                total: 0,
                recentCorrect: 0,
                recentTotal: 0,
                streak: 0,
                maxStreak: 0
            };
        }
        
        this.initPatternDatabase();
        this.initAdvancedPatterns();
    }

    initPatternDatabase() {
        this.patternDatabase = {
            '1-1': { pattern: ['T', 'X', 'T', 'X'], probability: 0.7, strength: 0.8 },
            '1-2-1': { pattern: ['T', 'X', 'X', 'T'], probability: 0.65, strength: 0.75 },
            '2-1-2': { pattern: ['T', 'T', 'X', 'T', 'T'], probability: 0.68, strength: 0.78 },
            '3-1': { pattern: ['T', 'T', 'T', 'X'], probability: 0.72, strength: 0.82 }
        };
    }

    initAdvancedPatterns() {
        this.advancedPatterns = {
            'dynamic-1': {
                detect: (data) => data.length >= 6,
                predict: () => 'X',
                confidence: 0.72
            }
        };
    }

    // CÁC PHƯƠNG THỨC CHÍNH - RÚT GỌN ĐỂ TRÁNH LỖI
    addResult(result) {
        this.history.push(result);
        if (this.history.length > 200) {
            this.history.shift();
        }
    }

    model1() {
        if (this.history.length < 3) return null;
        const last = this.history[this.history.length - 1];
        return {
            prediction: last === 'T' ? 'X' : 'T',
            confidence: 0.6,
            reason: 'Mô hình 1: Đảo chiều cơ bản'
        };
    }

    model2() {
        if (this.history.length < 5) return null;
        const tCount = this.history.filter(x => x === 'T').length;
        const xCount = this.history.filter(x => x === 'X').length;
        return {
            prediction: tCount > xCount ? 'T' : 'X',
            confidence: 0.65,
            reason: 'Mô hình 2: Theo đa số'
        };
    }

    getAllPredictions() {
        const predictions = {};
        for (let i = 1; i <= 5; i++) {
            predictions[`model${i}`] = this.models[`model${i}`]();
        }
        return predictions;
    }

    getFinalPrediction() {
        const predictions = this.getAllPredictions();
        const validPredictions = Object.values(predictions).filter(p => p !== null);
        
        if (validPredictions.length === 0) return null;

        let tScore = 0;
        let xScore = 0;

        validPredictions.forEach(prediction => {
            if (prediction.prediction === 'T') {
                tScore += prediction.confidence;
            } else {
                xScore += prediction.confidence;
            }
        });

        return {
            prediction: tScore > xScore ? 'T' : 'X',
            confidence: Math.max(tScore, xScore) / (tScore + xScore),
            reasons: validPredictions.map(p => p.reason)
        };
    }

    // Thêm các model đơn giản để test
    model3() { return this.model1(); }
    model4() { return this.model2(); }
    model5() { return this.model1(); }
}

// Khởi tạo hệ thống dự đoán SAU KHI class đã được định nghĩa
const predictionSystem = new UltraDicePredictionSystem();

// ============================================================================
// PHẦN CÒN LẠI CỦA ỨNG DỤNG
// ============================================================================

let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": "",
    "id": "@mrtinhios"
};

let currentSessionId = null;

const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const initialMessages = [
    [
        1,
        "MiniGame",
        "GM_fbbdbebndbbc",
        "123123p",
        {
            "info": "{\"ipAddress\":\"2402:800:62cd:cb7c:1a7:7a52:9c3e:c290\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJuZG5lYmViYnMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTIxMDczMTUsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTQ5MjYxMDI1MjcsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjJjZDpjYjdjOjFhNzo3YTUyOjljM2U6YzI5MCIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDEucG5nIiwicGxhdGZvcm1JZCI6NSwidXNlcklkIjoiN2RhNDlhNDQtMjlhYS00ZmRiLWJkNGMtNjU5OTQ5YzU3NDdkIiwicmVnVGltZSI6MTc1NDkyNjAyMjUxNSwicGhvbmUiOiIiLCJkZXBvc2l0IjpmYWxzZSwidXNlcm5hbWUiOiJHTV9mYmJkYmVibmRiYmMifQ.DAyEeoAnz8we-Qd0xS0tnqOZ8idkUJkxksBjr_Gei8A\",\"locale\":\"vi\",\"userId\":\"7da49a44-29aa-4fdb-bd4c-659949c5747d\",\"username\":\"GM_fbbdbebndbbc\",\"timestamp\":1754926102527,\"refreshToken\":\"7cc4ad191f4348849f69427a366ea0fd.a68ece9aa85842c7ba523170d0a4ae3e\"}",
            "signature": "53D9E12F910044B140A2EC659167512E2329502FE84A6744F1CD5CBA9B6EC04915673F2CBAE043C4EDB94DDF88F3D3E839A931100845B8F179106E1F44ECBB4253EC536610CCBD0CE90BD8495DAC3E8A9DBDB46FE49B51E88569A6F117F8336AC7ADC226B4F213ECE2F8E0996F2DD5515476C8275F0B2406CDF2987F38A6DA24"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }

    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected.');
        initialMessages.forEach((msg, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            }, i * 600);
        });

        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, PING_INTERVAL);
    });

    ws.on('pong', () => {
        console.log('[📶] Ping OK.');
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (!Array.isArray(data) || typeof data[1] !== 'object') {
                return;
            }

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
            }

            if (cmd === 1003 && gBB) {
                if (!d1 || !d2 || !d3) return;

                const total = d1 + d2 + d3;
                const result = (total > 10) ? "Tài" : "Xỉu";

                apiResponseData = {
                    "Phien": currentSessionId,
                    "Xuc_xac_1": d1,
                    "Xuc_xac_2": d2,
                    "Xuc_xac_3": d3,
                    "Tong": total,
                    "Ket_qua": result,
                    "id": "@mrtinhios"
                };
                
                console.log(`Phiên ${apiResponseData.Phien}: ${apiResponseData.Tong} (${apiResponseData.Ket_qua})`);
                
                // Cập nhật kết quả vào hệ thống dự đoán
                predictionSystem.addResult(result === "Tài" ? "T" : "X");
                
                // Lấy dự đoán cho phiên tiếp theo
                const nextPrediction = predictionSystem.getFinalPrediction();
                if (nextPrediction && nextPrediction.prediction) {
                    console.log(`🎯 Dự đoán phiên tiếp theo: ${nextPrediction.prediction} (Độ tin cậy: ${(nextPrediction.confidence * 100).toFixed(1)}%)`);
                    console.log(`📊 Lý do: ${nextPrediction.reasons ? nextPrediction.reasons[0] : 'Không có thông tin'}`);
                }
                
                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý message:', e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[🔌] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });

    ws.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        ws.close();
    });
}

// API endpoints
app.get('/api/ditmemaysun', (req, res) => {
    res.json(apiResponseData);
});

app.get('/api/prediction', (req, res) => {
    const prediction = predictionSystem.getFinalPrediction();
    res.json({
        current_result: apiResponseData,
        next_prediction: prediction
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        session_stats: predictionSystem.sessionStats,
        performance: predictionSystem.model13Mini ? predictionSystem.model13Mini() : 'Chưa khả dụng'
    });
});

app.get('/', (req, res) => {
    res.json(apiResponseData);
});

app.listen(PORT, () => {
    console.log(`[🌐] Server is running at http://localhost:${PORT}`);
    console.log(`[🤖] Ultra Dice Prediction System initialized`);
    connectWebSocket();
});

console.log('[🧠] Ultra Dice Prediction System loaded successfully!');
