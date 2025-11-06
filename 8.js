const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ============================================================================
// ULTRA DICE PREDICTION SYSTEM - PHIÊN BẢN ĐẦY ĐỦ
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
            regime: 'normal' // normal, volatile, trending, random
        };
        this.adaptiveParameters = {
            patternMinLength: 3,
            patternMaxLength: 8,
            volatilityThreshold: 0.7,
            trendStrengthThreshold: 0.6,
            patternConfidenceDecay: 0.95,
            patternConfidenceGrowth: 1.05
        };
        this.previousTopModels = null;
        this.initAllModels();
    }

    initAllModels() {
        // Khởi tạo tất cả models (21 chính + 21 mini + 42 hỗ trợ)
        for (let i = 1; i <= 21; i++) {
            // Model chính
            this.models[`model${i}`] = this[`model${i}`].bind(this);
            // Model mini
            this.models[`model${i}Mini`] = this[`model${i}Mini`] ? this[`model${i}Mini`].bind(this) : (() => null);
            // Model hỗ trợ
            this.models[`model${i}Support1`] = this[`model${i}Support1`] ? this[`model${i}Support1`].bind(this) : (() => null);
            this.models[`model${i}Support2`] = this[`model${i}Support2`] ? this[`model${i}Support2`].bind(this) : (() => null);
            
            // Khởi tạo trọng số và hiệu suất
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
        
        // Khởi tạo cơ sở dữ liệu pattern
        this.initPatternDatabase();
        this.initAdvancedPatterns();
    }

    initPatternDatabase() {
        this.patternDatabase = {
            '1-1': { pattern: ['T', 'X', 'T', 'X'], probability: 0.7, strength: 0.8 },
            '1-2-1': { pattern: ['T', 'X', 'X', 'T'], probability: 0.65, strength: 0.75 },
            '2-1-2': { pattern: ['T', 'T', 'X', 'T', 'T'], probability: 0.68, strength: 0.78 },
            '3-1': { pattern: ['T', 'T', 'T', 'X'], probability: 0.72, strength: 0.82 },
            '1-3': { pattern: ['T', 'X', 'X', 'X'], probability: 0.72, strength: 0.82 },
            '2-2': { pattern: ['T', 'T', 'X', 'X'], probability: 0.66, strength: 0.76 },
            '2-3': { pattern: ['T', 'T', 'X', 'X', 'X'], probability: 0.71, strength: 0.81 },
            '3-2': { pattern: ['T', 'T', 'T', 'X', 'X'], probability: 0.73, strength: 0.83 },
            '4-1': { pattern: ['T', 'T', 'T', 'T', 'X'], probability: 0.76, strength: 0.86 },
            '1-4': { pattern: ['T', 'X', 'X', 'X', 'X'], probability: 0.76, strength: 0.86 },
        };
    }

    initAdvancedPatterns() {
        this.advancedPatterns = {
            'dynamic-1': {
                detect: (data) => {
                    if (data.length < 6) return false;
                    const last6 = data.slice(-6);
                    return last6.filter(x => x === 'T').length === 4 && 
                           last6[last6.length-1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.72,
                description: "4T trong 6 phiên, cuối là T -> dự đoán X"
            },
            'dynamic-2': {
                detect: (data) => {
                    if (data.length < 8) return false;
                    const last8 = data.slice(-8);
                    const tCount = last8.filter(x => x === 'T').length;
                    return tCount >= 6 && last8[last8.length-1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.78,
                description: "6+T trong 8 phiên, cuối là T -> dự đoán X mạnh"
            },
            'alternating-3': {
                detect: (data) => {
                    if (data.length < 5) return false;
                    const last5 = data.slice(-5);
                    for (let i = 1; i < last5.length; i++) {
                        if (last5[i] === last5[i-1]) return false;
                    }
                    return true;
                },
                predict: (data) => data[data.length-1] === 'T' ? 'X' : 'T',
                confidence: 0.68,
                description: "5 phiên đan xen hoàn hảo -> dự đoán đảo chiều"
            }
        };
    }

    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }

    addResult(result) {
        // Cập nhật thống kê session
        if (this.history.length > 0) {
            const lastResult = this.history[this.history.length-1];
            const transitionKey = `${lastResult}to${result}`;
            this.sessionStats.transitions[transitionKey] = (this.sessionStats.transitions[transitionKey] || 0) + 1;
            
            // Cập nhật streak
            if (result === lastResult) {
                this.sessionStats.streaks[result]++;
                this.sessionStats.streaks[`max${result}`] = Math.max(
                    this.sessionStats.streaks[`max${result}`],
                    this.sessionStats.streaks[result]
                );
            } else {
                this.sessionStats.streaks[result] = 1;
                this.sessionStats.streaks[lastResult] = 0;
            }
        } else {
            this.sessionStats.streaks[result] = 1;
        }
        
        this.history.push(result);
        if (this.history.length > 200) {
            this.history.shift();
        }
        
        // Cập nhật độ biến động
        this.updateVolatility();
        
        // Cập nhật độ tin cậy pattern
        this.updatePatternConfidence();
        
        // Cập nhật trạng thái thị trường
        this.updateMarketState();
        
        // Cập nhật cơ sở dữ liệu pattern
        this.updatePatternDatabase();
        
        // Cập nhật hiệu suất models
        this.updatePerformance(result);
    }

    updateVolatility() {
        if (this.history.length < 10) return;
        
        const recent = this.history.slice(-10);
        let changes = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] !== recent[i-1]) changes++;
        }
        
        this.sessionStats.volatility = changes / (recent.length - 1);
    }

    updatePatternConfidence() {
        // Kiểm tra độ chính xác của các pattern đã được sử dụng
        for (const [patternName, confidence] of Object.entries(this.sessionStats.patternConfidence)) {
            if (this.history.length < 2) continue;
            
            const lastResult = this.history[this.history.length-1];
            
            // Đơn giản hóa: giảm confidence nếu pattern dự đoán sai
            if (this.advancedPatterns[patternName]) {
                const prediction = this.advancedPatterns[patternName].predict(this.history.slice(0, -1));
                if (prediction !== lastResult) {
                    this.sessionStats.patternConfidence[patternName] = Math.max(
                        0.1, 
                        confidence * this.adaptiveParameters.patternConfidenceDecay
                    );
                } else {
                    this.sessionStats.patternConfidence[patternName] = Math.min(
                        0.95, 
                        confidence * this.adaptiveParameters.patternConfidenceGrowth
                    );
                }
            }
        }
    }

    updateMarketState() {
        if (this.history.length < 15) return;
        
        const recent = this.history.slice(-15);
        const tCount = recent.filter(x => x === 'T').length;
        const xCount = recent.filter(x => x === 'X').length;
        
        // Tính trend strength
        const trendStrength = Math.abs(tCount - xCount) / recent.length;
        
        // Xác định trend
        if (trendStrength > this.adaptiveParameters.trendStrengthThreshold) {
            this.marketState.trend = tCount > xCount ? 'up' : 'down';
        } else {
            this.marketState.trend = 'neutral';
        }
        
        // Tính momentum (dựa trên thay đổi gần đây)
        let momentum = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] === recent[i-1]) {
                momentum += recent[i] === 'T' ? 0.1 : -0.1;
            }
        }
        this.marketState.momentum = Math.tanh(momentum); // Chuẩn hóa về [-1, 1]
        
        // Tính stability (ngược với volatility)
        this.marketState.stability = 1 - this.sessionStats.volatility;
        
        // Xác định regime
        if (this.sessionStats.volatility > this.adaptiveParameters.volatilityThreshold) {
            this.marketState.regime = 'volatile';
        } else if (trendStrength > 0.7) {
            this.marketState.regime = 'trending';
        } else if (trendStrength < 0.3) {
            this.marketState.regime = 'random';
        } else {
            this.marketState.regime = 'normal';
        }
    }

    updatePatternDatabase() {
        if (this.history.length < 10) return;
        
        // Phát hiện pattern mới từ lịch sử
        for (let length = this.adaptiveParameters.patternMinLength; 
             length <= this.adaptiveParameters.patternMaxLength; length++) {
            for (let i = 0; i <= this.history.length - length; i++) {
                const segment = this.history.slice(i, i + length);
                const patternKey = segment.join('-');
                
                if (!this.patternDatabase[patternKey]) {
                    // Tính probability cho pattern mới
                    let count = 0;
                    for (let j = 0; j <= this.history.length - length - 1; j++) {
                        const testSegment = this.history.slice(j, j + length);
                        if (testSegment.join('-') === patternKey) {
                            count++;
                        }
                    }
                    
                    if (count > 2) { // Chỉ thêm pattern có xuất hiện ít nhất 3 lần
                        const probability = count / (this.history.length - length);
                        const strength = Math.min(0.9, probability * 1.2);
                        
                        this.patternDatabase[patternKey] = {
                            pattern: segment,
                            probability: probability,
                            strength: strength
                        };
                    }
                }
            }
        }
    }

    // MODEL 1: Nhận biết các loại cầu cơ bản
    model1() {
        const recent = this.history.slice(-10);
        if (recent.length < 4) return null;
        
        const patterns = this.model1Mini(recent);
        if (patterns.length === 0) return null;
        
        const bestPattern = patterns.reduce((best, current) => 
            current.probability > best.probability ? current : best
        );
        
        // Điều chỉnh confidence dựa trên market regime
        let confidence = bestPattern.probability * 0.8;
        if (this.marketState.regime === 'trending') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.9;
        }
        
        return {
            prediction: bestPattern.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Phát hiện pattern ${bestPattern.type} (xác suất ${bestPattern.probability.toFixed(2)})`
        };
    }

    model1Mini(data) {
        const patterns = [];
        
        // Kiểm tra các pattern trong database
        for (const [type, patternData] of Object.entries(this.patternDatabase)) {
            const pattern = patternData.pattern;
            if (data.length < pattern.length) continue;
            
            const segment = data.slice(-pattern.length + 1); // So sánh với pattern trừ phần tử cuối
            const patternWithoutLast = pattern.slice(0, -1);
            
            if (segment.join('-') === patternWithoutLast.join('-')) {
                patterns.push({
                    type: type,
                    prediction: pattern[pattern.length - 1],
                    probability: patternData.probability,
                    strength: patternData.strength
                });
            }
        }
        
        return patterns;
    }

    model1Support1() {
        return { 
            status: "Phân tích pattern nâng cao",
            totalPatterns: Object.keys(this.patternDatabase).length
        };
    }

    model1Support2() {
        const patternCount = Object.keys(this.patternDatabase).length;
        const avgConfidence = patternCount > 0 ? 
            Object.values(this.patternDatabase).reduce((sum, p) => sum + p.probability, 0) / patternCount : 0;
        
        return { 
            status: "Đánh giá độ tin cậy pattern",
            patternCount,
            averageConfidence: avgConfidence
        };
    }

    // MODEL 2: Bắt trend xu hướng ngắn và dài
    model2() {
        const shortTerm = this.history.slice(-5);
        const longTerm = this.history.slice(-20);
        
        if (shortTerm.length < 3 || longTerm.length < 10) return null;
        
        const shortAnalysis = this.model2Mini(shortTerm);
        const longAnalysis = this.model2Mini(longTerm);
        
        let prediction, confidence, reason;
        
        if (shortAnalysis.trend === longAnalysis.trend) {
            prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
            confidence = (shortAnalysis.strength + longAnalysis.strength) / 2;
            reason = `Xu hướng ngắn và dài hạn cùng ${shortAnalysis.trend}`;
        } else {
            if (shortAnalysis.strength > longAnalysis.strength * 1.5) {
                prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = shortAnalysis.strength;
                reason = `Xu hướng ngắn hạn mạnh hơn dài hạn`;
            } else {
                prediction = longAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = longAnalysis.strength;
                reason = `Xu hướng dài hạn ổn định hơn`;
            }
        }
        
        // Điều chỉnh confidence dựa trên market regime
        if (this.marketState.regime === 'trending') {
            confidence *= 1.15;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.85;
        }
        
        return { 
            prediction, 
            confidence: Math.min(0.95, confidence * 0.9), 
            reason 
        };
    }

    model2Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        
        let trend = tCount > xCount ? 'up' : (xCount > tCount ? 'down' : 'neutral');
        let strength = Math.abs(tCount - xCount) / data.length;
        
        // Phân tích chi tiết hơn
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        
        const volatility = changes / (data.length - 1);
        strength = strength * (1 - volatility / 2); // Điều chỉnh strength based on volatility
        
        return { trend, strength, volatility };
    }

    // MODEL 3: Xem trong 12 phiên gần nhất có sự chênh lệch cao thì sẽ dự đoán bên còn lại
    model3() {
        const recent = this.history.slice(-12);
        if (recent.length < 12) return null;
        
        const analysis = this.model3Mini(recent);
        
        if (analysis.difference < 0.4) return null;
        
        // Điều chỉnh confidence dựa trên market regime
        let confidence = analysis.difference * 0.8;
        if (this.marketState.regime === 'random') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'trending') {
            confidence *= 0.9;
        }
        
        return {
            prediction: analysis.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Chênh lệch cao (${Math.round(analysis.difference * 100)}%) trong 12 phiên, dự đoán cân bằng`
        };
    }

    model3Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        const total = data.length;
        const difference = Math.abs(tCount - xCount) / total;
        
        return {
            difference,
            prediction: tCount > xCount ? 'X' : 'T',
            tCount,
            xCount
        };
    }

    // MODEL 4: Bắt cầu ngắn hạn
    model4() {
        const recent = this.history.slice(-6);
        if (recent.length < 4) return null;
        
        const analysis = this.model4Mini(recent);
        
        if (analysis.confidence < 0.6) return null;
        
        // Điều chỉnh confidence dựa trên market regime
        let confidence = analysis.confidence;
        if (this.marketState.regime === 'trending') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.9;
        }
        
        return {
            prediction: analysis.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Cầu ngắn hạn ${analysis.trend} với độ tin cậy ${analysis.confidence.toFixed(2)}`
        };
    }

    model4Mini(data) {
        // Phân tích momentum ngắn hạn
        const last3 = data.slice(-3);
        const tCount = last3.filter(x => x === 'T').length;
        const xCount = last3.filter(x => x === 'X').length;
        
        let prediction, confidence, trend;
        
        if (tCount === 3) {
            prediction = 'T';
            confidence = 0.7;
            trend = 'Tăng mạnh';
        } else if (xCount === 3) {
            prediction = 'X';
            confidence = 0.7;
            trend = 'Giảm mạnh';
        } else if (tCount === 2) {
            prediction = 'T';
            confidence = 0.65;
            trend = 'Tăng nhẹ';
        } else if (xCount === 2) {
            prediction = 'X';
            confidence = 0.65;
            trend = 'Giảm nhẹ';
        } else {
            // Phân tích pattern phức tạp hơn
            const changes = data.slice(-4).filter((val, idx, arr) => 
                idx > 0 && val !== arr[idx-1]).length;
            
            if (changes >= 3) {
                prediction = data[data.length - 1] === 'T' ? 'X' : 'T';
                confidence = 0.6;
                trend = 'Đảo chiều';
            } else {
                prediction = data[data.length - 1];
                confidence = 0.55;
                trend = 'Ổn định';
            }
        }
        
        return { prediction, confidence, trend };
    }

    // MODEL 5: Nếu tỉ lệ trọng số dự đoán tài /Xỉu chênh lệch cao thì cân bằng lại
    model5() {
        const predictions = this.getAllPredictions();
        const tPredictions = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xPredictions = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const total = tPredictions + xPredictions;
        
        if (total < 5) return null;
        
        const difference = Math.abs(tPredictions - xPredictions) / total;
        
        if (difference > 0.6) {
            return {
                prediction: tPredictions > xPredictions ? 'X' : 'T',
                confidence: difference * 0.9,
                reason: `Cân bằng tỷ lệ chênh lệch cao (${Math.round(difference * 100)}%) giữa các model`
            };
        }
        
        return null;
    }

    // MODEL 6: Biết lúc nào nên bắt theo cầu hay bẻ cầu
    model6() {
        const trendAnalysis = this.model2();
        const continuity = this.model6Mini(this.history.slice(-8));
        const breakProbability = this.model10Mini(this.history);
        
        if (continuity.streak >= 5 && breakProbability > 0.7) {
            return {
                prediction: trendAnalysis.prediction === 'T' ? 'X' : 'T',
                confidence: breakProbability * 0.8,
                reason: `Cầu liên tục ${continuity.streak} lần, xác suất bẻ cầu ${breakProbability.toFixed(2)}`
            };
        }
        
        return {
            prediction: trendAnalysis.prediction,
            confidence: trendAnalysis.confidence * 0.9,
            reason: `Tiếp tục theo xu hướng, cầu chưa đủ mạnh để bẻ`
        };
    }

    model6Mini(data) {
        if (data.length < 2) return { streak: 0, direction: 'neutral', maxStreak: 0 };
        
        let currentStreak = 1;
        let maxStreak = 1;
        let direction = data[data.length - 1];
        
        for (let i = data.length - 1; i > 0; i--) {
            if (data[i] === data[i-1]) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                break;
            }
        }
        
        return { streak: currentStreak, direction, maxStreak };
    }

    // MODEL 7: Cân bằng trọng số từng model khi chênh lệch quá cao
    model7() {
        const performanceStats = this.model13Mini();
        const imbalance = this.model7Mini(performanceStats);
        
        if (imbalance > 0.3) {
            this.adjustWeights(performanceStats);
            return {
                prediction: null,
                confidence: 0,
                reason: `Điều chỉnh trọng số do chênh lệch hiệu suất ${imbalance.toFixed(2)}`
            };
        }
        
        return null;
    }

    model7Mini(performanceStats) {
        const accuracies = Object.values(performanceStats).map(p => p.accuracy);
        if (accuracies.length < 2) return 0;
        
        const maxAccuracy = Math.max(...accuracies);
        const minAccuracy = Math.min(...accuracies);
        
        return (maxAccuracy - minAccuracy) / maxAccuracy;
    }

    adjustWeights(performanceStats) {
        const avgAccuracy = Object.values(performanceStats).reduce((sum, p) => sum + p.accuracy, 0) / 
                           Object.values(performanceStats).length;
        
        for (const [model, stats] of Object.entries(performanceStats)) {
            // Điều chỉnh trọng số dựa trên độ lệch so với trung bình
            const deviation = stats.accuracy - avgAccuracy;
            this.weights[model] = Math.max(0.1, Math.min(2, 1 + deviation * 2));
        }
    }

    // MODEL 8: Nhận biết cầu xấu (cầu ko theo bất kì xu hướng nào)
    model8() {
        const randomness = this.model8Mini(this.history.slice(-15));
        
        if (randomness > 0.7) {
            // Giảm trọng số các model dựa trên pattern
            ['model1', 'model4', 'model9', 'model12'].forEach(model => {
                this.weights[model] = Math.max(0.3, this.weights[model] * 0.7);
            });
            
            // Tăng trọng số các model dựa trên mean reversion
            ['model3', 'model5', 'model6'].forEach(model => {
                this.weights[model] = Math.min(2, this.weights[model] * 1.2);
            });
            
            return {
                prediction: null,
                confidence: 0,
                reason: `Phát hiện cầu xấu (độ ngẫu nhiên ${randomness.toFixed(2)}), điều chỉnh trọng số model`
            };
        }
        
        return null;
    }

    model8Mini(data) {
        if (data.length < 10) return 0;
        
        // Tính độ ngẫu nhiên dựa trên số lần thay đổi
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        
        const changeRatio = changes / (data.length - 1);
        
        // Tính phân bố
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        const distribution = Math.abs(tCount - xCount) / data.length;
        
        // Tính entropy
        const pT = tCount / data.length;
        const pX = xCount / data.length;
        let entropy = 0;
        if (pT > 0) entropy -= pT * Math.log2(pT);
        if (pX > 0) entropy -= pX * Math.log2(pX);
        
        // Kết hợp cả ba yếu tố
        return (changeRatio * 0.4 + (1 - distribution) * 0.3 + entropy * 0.3);
    }

    // MODEL 9: Nhận biết các loại cầu cơ bản (nâng cao)
    model9() {
        const recent = this.history.slice(-12);
        if (recent.length < 8) return null;
        
        const complexPatterns = this.model9Mini(recent);
        if (complexPatterns.length === 0) return null;
        
        const bestPattern = complexPatterns.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
        );
        
        // Điều chỉnh confidence dựa trên market regime
        let confidence = bestPattern.confidence;
        if (this.marketState.regime === 'trending') {
            confidence *= 1.1;
        } else if (this.marketState.regime === 'volatile') {
            confidence *= 0.9;
        }
        
        return {
            prediction: bestPattern.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Phát hiện pattern phức tạp: ${bestPattern.type}`
        };
    }

    model9Mini(data) {
        const patterns = [];
        
        // Kiểm tra các pattern phức tạp hơn
        for (let patternLength = 4; patternLength <= 6; patternLength++) {
            if (data.length < patternLength) continue;
            
            const segment = data.slice(-patternLength);
            const patternKey = segment.join('-');
            
            if (this.patternDatabase[patternKey]) {
                patterns.push({
                    type: patternKey,
                    prediction: this.patternDatabase[patternKey].pattern[
                        this.patternDatabase[patternKey].pattern.length - 1
                    ],
                    confidence: this.patternDatabase[patternKey].probability * 0.75
                });
            }
        }
        
        return patterns;
    }

    // MODEL 10: Nhận biết xác suất bẻ cầu
    model10() {
        const breakProb = this.model10Mini(this.history);
        
        return {
            prediction: null,
            confidence: breakProb,
            reason: `Xác suất bẻ cầu: ${breakProb.toFixed(2)}`
        };
    }

    model10Mini(data) {
        if (data.length < 20) return 0.5;
        
        let breakCount = 0;
        let totalOpportunities = 0;
        
        for (let i = 5; i < data.length; i++) {
            const segment = data.slice(i-5, i);
            const streak = this.model6Mini(segment).streak;
            
            if (streak >= 4) {
                totalOpportunities++;
                if (data[i] !== segment[segment.length-1]) {
                    breakCount++;
                }
            }
        }
        
        return totalOpportunities > 0 ? breakCount / totalOpportunities : 0.5;
    }

    // MODEL 11: Nhận diện biến động xúc xắc và nguyên lý xúc xắc
    model11() {
        const volatility = this.model11Mini(this.history.slice(-20));
        const prediction = this.model11Predict(volatility);
        
        return {
            prediction: prediction.value,
            confidence: prediction.confidence,
            reason: `Biến động ${volatility.level}, dự đoán ${prediction.value}`
        };
    }

    model11Mini(data) {
        if (data.length < 10) return { level: 'medium', value: 0.5 };
        
        let changes = 0;
        for (let i = 1; i < data.length; i++) {
            if (data[i] !== data[i-1]) changes++;
        }
        
        const changeRatio = changes / (data.length - 1);
        
        if (changeRatio < 0.3) return { level: 'low', value: changeRatio };
        if (changeRatio > 0.7) return { level: 'high', value: changeRatio };
        return { level: 'medium', value: changeRatio };
    }

    model11Predict(volatility) {
        if (volatility.level === 'low') {
            // Ít biến động, tiếp tục xu hướng
            const last = this.history[this.history.length - 1];
            return { value: last, confidence: 0.7 };
        } else if (volatility.level === 'high') {
            // Nhiều biến động, khó dự đoán
            return { value: Math.random() > 0.5 ? 'T' : 'X', confidence: 0.5 };
        } else {
            // Biến động trung bình
            const trend = this.model2Mini(this.history.slice(-10));
            return { 
                value: trend.trend === 'up' ? 'T' : 'X', 
                confidence: trend.strength * 0.8 
            };
        }
    }

    // MODEL 12: nhận diện nhiều mẫu cầu hơn ngắn
    model12() {
        const shortPatterns = this.model12Mini(this.history.slice(-8));
        
        if (shortPatterns.length === 0) return null;
        
        const bestPattern = shortPatterns.reduce((best, current) => 
            current.confidence > best.confidence ? current : best
        );
        
        return {
            prediction: bestPattern.prediction,
            confidence: bestPattern.confidence,
            reason: `Mẫu cầu ngắn: ${bestPattern.type}`
        };
    }

    model12Mini(data) {
        const patterns = [];
        
        // Các mẫu ngắn đặc biệt
        const shortPatterns = {
            'T-X-T': { prediction: 'X', confidence: 0.65 },
            'X-T-X': { prediction: 'T', confidence: 0.65 },
            'T-T-X': { prediction: 'X', confidence: 0.7 },
            'X-X-T': { prediction: 'T', confidence: 0.7 },
            'T-X-X': { prediction: 'T', confidence: 0.6 },
            'X-T-T': { prediction: 'X', confidence: 0.6 },
            'T-T-T-X': { prediction: 'X', confidence: 0.72 },
            'X-X-X-T': { prediction: 'T', confidence: 0.72 },
            'T-X-T-X': { prediction: 'X', confidence: 0.68 },
            'X-T-X-T': { prediction: 'T', confidence: 0.68 }
        };
        
        if (data.length >= 3) {
            const last3 = data.slice(-3).join('-');
            if (shortPatterns[last3]) {
                patterns.push({
                    type: last3,
                    prediction: shortPatterns[last3].prediction,
                    confidence: shortPatterns[last3].confidence
                });
            }
        }
        
        if (data.length >= 4) {
            const last4 = data.slice(-4).join('-');
            if (shortPatterns[last4]) {
                patterns.push({
                    type: last4,
                    prediction: shortPatterns[last4].prediction,
                    confidence: shortPatterns[last4].confidence
                });
            }
        }
        
        return patterns;
    }

    // MODEL 13: đánh giá hiệu suất từng mô hình
    model13() {
        const performance = this.model13Mini();
        const bestModel = Object.entries(performance).reduce((best, [model, stats]) => 
            stats.accuracy > best.accuracy ? { model, ...stats } : best
        , { model: null, accuracy: 0 });
        
        return {
            prediction: null,
            confidence: bestModel.accuracy,
            reason: `Model hiệu suất cao nhất: ${bestModel.model} (${bestModel.accuracy.toFixed(2)})`
        };
    }

    model13Mini() {
        const stats = {};
        
        for (const model of Object.keys(this.performance)) {
            if (this.performance[model].total > 0) {
                stats[model] = {
                    accuracy: this.performance[model].correct / this.performance[model].total,
                    recentAccuracy: this.performance[model].recentTotal > 0 ? 
                        this.performance[model].recentCorrect / this.performance[model].recentTotal : 0,
                    total: this.performance[model].total,
                    recentTotal: this.performance[model].recentTotal,
                    streak: this.performance[model].streak,
                    maxStreak: this.performance[model].maxStreak
                };
            }
        }
        
        return stats;
    }

    // MODEL 14: tính xác xuất bẻ cầu xu hướng
    model14() {
        const breakProb = this.model14Mini(this.history);
        
        return {
            prediction: null,
            confidence: breakProb,
            reason: `Xác suất bẻ cầu xu hướng: ${breakProb.toFixed(2)}`
        };
    }

    model14Mini(data) {
        if (data.length < 15) return 0.5;
        
        let breakCount = 0;
        let trendCount = 0;
        
        for (let i = 10; i < data.length; i++) {
            const segment = data.slice(i-10, i);
            const trend = this.model2Mini(segment);
            
            if (trend.strength > 0.6) {
                trendCount++;
                if (data[i] !== (trend.trend === 'up' ? 'T' : 'X')) {
                    breakCount++;
                }
            }
        }
        
        return trendCount > 0 ? breakCount / trendCount : 0.5;
    }

    // MODEL 15: suy nghĩ có nên bắt theo xu hướng ko
    model15() {
        const trend = this.model2();
        const breakProb = this.model14Mini(this.history);
        const shouldFollow = this.model15Mini(trend.confidence, breakProb);
        
        return {
            prediction: shouldFollow ? trend.prediction : (trend.prediction === 'T' ? 'X' : 'T'),
            confidence: shouldFollow ? trend.confidence : (1 - trend.confidence),
            reason: shouldFollow ? 
                `Nên theo xu hướng (xác suất bẻ thấp)` : 
                `Nên bẻ xu hướng (xác suất bẻ cao)`
        };
    }

    model15Mini(trendConfidence, breakProbability) {
        // Quyết định dựa trên độ tin cậy xu hướng và xác suất bẻ
        return trendConfidence > breakProbability * 1.5;
    }

    // MODEL 16: tính xác suất bẻ cầu (phiên bản nâng cao)
    model16() {
        const breakProb = this.model16Mini(this.history);
        
        return {
            prediction: null,
            confidence: breakProb,
            reason: `Xác suất bẻ cầu tổng hợp: ${breakProb.toFixed(2)}`
        };
    }

    model16Mini(data) {
        // Kết hợp nhiều phương pháp tính xác suất bẻ
        const prob1 = this.model10Mini(data);
        const prob2 = this.model14Mini(data);
        
        // Phân tích recent breaks
        let recentBreaks = 0;
        let recentOpportunities = 0;
        
        for (let i = Math.max(0, data.length - 10); i < data.length - 1; i++) {
            if (i >= 5) {
                const segment = data.slice(i-5, i);
                const streak = this.model6Mini(segment).streak;
                
                if (streak >= 3) {
                    recentOpportunities++;
                    if (data[i] !== segment[segment.length-1]) {
                        recentBreaks++;
                    }
                }
            }
        }
        
        const prob3 = recentOpportunities > 0 ? recentBreaks / recentOpportunities : 0.5;
        
        // Trung bình có trọng số
        return (prob1 * 0.4 + prob2 * 0.4 + prob3 * 0.2);
    }

    // MODEL 17: cân bằng trọng số (nâng cao)
    model17() {
        const performance = this.model13Mini();
        const imbalance = this.model17Mini(performance);
        
        if (imbalance > 0.25) {
            this.adjustWeightsAdvanced(performance);
            return {
                prediction: null,
                confidence: 0,
                reason: `Cân bằng trọng số nâng cao, độ chênh lệch: ${imbalance.toFixed(2)}`
            };
        }
        
        return null;
    }

    model17Mini(performance) {
        const accuracies = Object.values(performance).map(p => p.accuracy);
        if (accuracies.length < 2) return 0;
        
        const mean = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
        const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) / accuracies.length;
        
        return Math.sqrt(variance) / mean;
    }

    adjustWeightsAdvanced(performance) {
        const meanAccuracy = Object.values(performance).reduce((sum, p) => sum + p.accuracy, 0) / 
                            Object.values(performance).length;
        
        for (const [model, stats] of Object.entries(performance)) {
            if (stats.accuracy > meanAccuracy * 1.2) {
                this.weights[model] = Math.min(2, this.weights[model] * 1.1);
            } else if (stats.accuracy < meanAccuracy * 0.8) {
                this.weights[model] = Math.max(0.1, this.weights[model] * 0.9);
            }
        }
    }

    // MODEL 18: nhận biết xu hướng cầu và đoán theo xu hướng ngắn hạn
    model18() {
        const shortTrend = this.model18Mini(this.history.slice(-6));
        
        return {
            prediction: shortTrend.prediction,
            confidence: shortTrend.confidence,
            reason: `Xu hướng ngắn hạn: ${shortTrend.trend}`
        };
    }

    model18Mini(data) {
        if (data.length < 4) return { prediction: null, confidence: 0, trend: 'Không xác định' };
        
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        
        let prediction, confidence, trend;
        
        if (tCount > xCount * 1.5) {
            prediction = 'T';
            confidence = 0.7;
            trend = 'Mạnh T';
        } else if (xCount > tCount * 1.5) {
            prediction = 'X';
            confidence = 0.7;
            trend = 'Mạnh X';
        } else if (tCount > xCount) {
            prediction = 'T';
            confidence = 0.6;
            trend = 'Nhẹ T';
        } else if (xCount > tCount) {
            prediction = 'X';
            confidence = 0.6;
            trend = 'Nhẹ X';
        } else {
            prediction = data[data.length - 1] === 'T' ? 'X' : 'T';
            confidence = 0.55;
            trend = 'Cân bằng';
        }
        
        return { prediction, confidence, trend };
    }

    // MODEL 19: các xu hướng phổ biến
    model19() {
        const commonTrends = this.model19Mini(this.history.slice(-30));
        
        if (commonTrends.length === 0) return null;
        
        const bestTrend = commonTrends.reduce((best, current) => 
            current.frequency > best.frequency ? current : best
        );
        
        return {
            prediction: bestTrend.prediction,
            confidence: bestTrend.confidence,
            reason: `Xu hướng phổ biến: ${bestTrend.pattern} (tần suất ${bestTrend.frequency})`
        };
    }

    model19Mini(data) {
        const trends = [];
        
        // Phân tích các xu hướng phổ biến trong lịch sử
        const patternCounts = {};
        
        for (let length = 3; length <= 5; length++) {
            for (let i = 0; i <= data.length - length; i++) {
                const pattern = data.slice(i, i + length).join('-');
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            }
        }
        
        // Chọn các pattern có tần suất cao
        for (const [pattern, count] of Object.entries(patternCounts)) {
            if (count >= 3) { // Xuất hiện ít nhất 3 lần
                const patternParts = pattern.split('-');
                const prediction = patternParts[patternParts.length - 1];
                const frequency = count / (data.length - patternParts.length + 1);
                
                trends.push({
                    pattern,
                    prediction,
                    frequency,
                    confidence: Math.min(0.8, frequency * 2)
                });
            }
        }
        
        return trends;
    }

    // MODEL 20: Max Performance - kết hợp các model tốt nhất
    model20() {
        const performance = this.model13Mini();
        const bestModels = Object.entries(performance)
            .filter(([_, stats]) => stats.total > 10)
            .sort((a, b) => b[1].accuracy - a[1].accuracy)
            .slice(0, 3);
        
        if (bestModels.length === 0) return null;
        
        const predictions = {};
        for (const [model] of bestModels) {
            predictions[model] = this.models[model]();
        }
        
        let tScore = 0;
        let xScore = 0;
        
        for (const [model, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                const weight = performance[model].accuracy;
                if (prediction.prediction === 'T') {
                    tScore += weight * prediction.confidence;
                } else {
                    xScore += prediction.confidence;
                }
            }
        }
        
        const totalScore = tScore + xScore;
        if (totalScore === 0) return null;
        
        return {
            prediction: tScore > xScore ? 'T' : 'X',
            confidence: Math.max(tScore, xScore) / totalScore,
            reason: `Kết hợp ${bestModels.length} model hiệu suất cao nhất`
        };
    }

    // MODEL 21: cân bằng tất cả khi thấy chênh lệch cao
    model21() {
        const predictions = this.getAllPredictions();
        const tCount = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xCount = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const total = tCount + xCount;
        
        if (total < 8) return null;
        
        const difference = Math.abs(tCount - xCount) / total;
        
        if (difference > 0.5) {
            // Cân bằng bằng cách điều chỉnh ngưỡng confidence
            const adjustedPredictions = this.model21Mini(predictions, difference);
            
            let tScore = 0;
            let xScore = 0;
            
            for (const prediction of Object.values(adjustedPredictions)) {
                if (prediction && prediction.prediction) {
                    if (prediction.prediction === 'T') {
                        tScore += prediction.confidence;
                    } else {
                        xScore += prediction.confidence;
                    }
                }
            }
            
            const totalScore = tScore + xScore;
            if (totalScore === 0) return null;
            
            return {
                prediction: tScore > xScore ? 'T' : 'X',
                confidence: Math.max(tScore, xScore) / totalScore,
                reason: `Cân bằng tổng thể, chênh lệch ban đầu: ${difference.toFixed(2)}`
            };
        }
        
        return null;
    }

    model21Mini(predictions, difference) {
        const adjusted = {};
        const adjustment = 1 - difference; // Điều chỉnh ngược với độ chênh lệch
        
        for (const [model, prediction] of Object.entries(predictions)) {
            if (prediction) {
                adjusted[model] = {
                    ...prediction,
                    confidence: prediction.confidence * adjustment
                };
            }
        }
        
        return adjusted;
    }

    // Utility methods
    getAllPredictions() {
        const predictions = {};
        
        for (let i = 1; i <= 21; i++) {
            predictions[`model${i}`] = this.models[`model${i}`]();
        }
        
        return predictions;
    }

    getFinalPrediction() {
        const predictions = this.getAllPredictions();
        let tScore = 0;
        let xScore = 0;
        let totalWeight = 0;
        let reasons = [];
        
        for (const [modelName, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                const weight = this.weights[modelName] || 1;
                const score = prediction.confidence * weight;
                
                if (prediction.prediction === 'T') {
                    tScore += score;
                } else if (prediction.prediction === 'X') {
                    xScore += score;
                }
                
                totalWeight += weight;
                reasons.push(`${modelName}: ${prediction.reason} (${prediction.confidence.toFixed(2)})`);
            }
        }
        
        if (totalWeight === 0) return null;
        
        let finalPrediction = null;
        let finalConfidence = 0;
        
        if (tScore > xScore) {
            finalPrediction = 'T';
            finalConfidence = tScore / (tScore + xScore);
        } else if (xScore > tScore) {
            finalPrediction = 'X';
            finalConfidence = xScore / (tScore + xScore);
        }
        
        // Điều chỉnh confidence dựa trên độ biến động
        finalConfidence = this.adjustConfidenceByVolatility(finalConfidence);
        
        return {
            prediction: finalPrediction,
            confidence: finalConfidence,
            reasons: reasons,
            details: predictions,
            sessionStats: this.sessionStats,
            marketState: this.marketState
        };
    }

    adjustConfidenceByVolatility(confidence) {
        // Giảm confidence khi volatility cao
        if (this.sessionStats.volatility > 0.7) {
            return confidence * 0.8;
        }
        // Tăng confidence khi volatility thấp
        if (this.sessionStats.volatility < 0.3) {
            return Math.min(0.95, confidence * 1.1);
        }
        return confidence;
    }

    updatePerformance(actualResult) {
        const predictions = this.getAllPredictions();
        
        for (const [modelName, prediction] of Object.entries(predictions)) {
            if (prediction && prediction.prediction) {
                this.performance[modelName].total++;
                this.performance[modelName].recentTotal++;
                
                if (prediction.prediction === actualResult) {
                    this.performance[modelName].correct++;
                    this.performance[modelName].recentCorrect++;
                    this.performance[modelName].streak++;
                    this.performance[modelName].maxStreak = Math.max(
                        this.performance[modelName].maxStreak,
                        this.performance[modelName].streak
                    );
                } else {
                    this.performance[modelName].streak = 0;
                }
                
                // Giữ recent stats trong phạm vi 50 lần
                if (this.performance[modelName].recentTotal > 50) {
                    this.performance[modelName].recentTotal--;
                    if (this.performance[modelName].recentCorrect > 0 && 
                        this.performance[modelName].recentCorrect / this.performance[modelName].recentTotal > 
                        this.performance[modelName].correct / this.performance[modelName].total) {
                        this.performance[modelName].recentCorrect--;
                    }
                }
                
                // Cập nhật trọng số
                const accuracy = this.performance[modelName].correct / this.performance[modelName].total;
                this.weights[modelName] = Math.max(0.1, Math.min(2, accuracy * 2));
            }
        }
        
        // Cập nhật session accuracy
        const totalPredictions = Object.values(predictions).filter(p => p && p.prediction).length;
        const correctPredictions = Object.values(predictions).filter(p => p && p.prediction === actualResult).length;
        this.sessionStats.recentAccuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;
    }
}

// Khởi tạo hệ thống dự đoán SAU KHI class đã được định nghĩa
const predictionSystem = new UltraDicePredictionSystem();

// ============================================================================
// PHẦN CÒN LẠI CỦA ỨNG DỤNG (GIỐNG NHƯ TRƯỚC)
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
const patternHistory = [];

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
            "info": "{\"ipAddress\":\"2402:800:62cd:cb7c:1a7:7a52:9c3e:c290\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAlsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJuZG5lYmViYnMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTIxMDczMTUsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTQ5MjYxMDI1MjcsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjJjZDpjYjdjOjFhNzo3YTUyOjljM2U6YzI5MCIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDEucG5nIiwicGxhdGZvcm1JZCI6NSwidXNlcklkIjoiN2RhNDlhNDQtMjlhYS00ZmRiLWJkNGMtNjU5OTQ5YzU3NDdkIiwicmVnVGltZSI6MTc1NDkyNjAyMjUxNSwicGhvbmUiOiIiLCJkZXBvc2l0IjpmYWxzZSwidXNlcm5hbWUiOiJHTV9mYmJkYmVibmRiYmMifQ.DAyEeoAnz8we-Qd0xS0tnqOZ8idkUJkxksBjr_Gei8A\",\"locale\":\"vi\",\"userId\":\"7da49a44-29aa-4fdb-bd4c-659949c5747d\",\"username\":\"GM_fbbdbebndbbc\",\"timestamp\":1754926102527,\"refreshToken\":\"7cc4ad191f4348849f69427a366ea0fd.a68ece9aa85842c7ba523170d0a4ae3e\"}",
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
        market_state: predictionSystem.marketState,
        performance: predictionSystem.model13Mini()
    });
});

app.get('/', (req, res) => {
    res.json(apiResponseData);
});

app.listen(PORT, () => {
    console.log(`[🌐] Server is running at http://localhost:${PORT}`);
    console.log(`[🤖] Ultra Dice Prediction System initialized với 21 models đầy đủ`);
    connectWebSocket();
});

console.log('[🧠] Ultra Dice Prediction System loaded successfully!');
