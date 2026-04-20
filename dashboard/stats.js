// ══════════════════════════════════════════════════════════════════════════════
// İSTATİSTİK MODÜLÜ
// Birim fiyat / aidat istatistikleri hesaplama ve geçmiş dönem karşılaştırması.
// Bağımlılık: Yok (argüman olarak veri alır, DOM'u direkt günceller)
// ══════════════════════════════════════════════════════════════════════════════

const StatsModule = {

    calculateStats(data, rate, symbol) {
        const totalCount = data.length;
        const priceM2List = data.filter(item => item.BirimFiyat).map(item => parseFloat(item.BirimFiyat) || 0);
        const aidatM2List = data.filter(item => item.AidatM2).map(item => parseFloat(item.AidatM2) || 0);

        // --- Yardımcı Math Fonksiyonları ---
        const getSum = (arr) => arr.reduce((a, b) => a + b, 0);
        const getMean = (arr) => arr.length ? getSum(arr) / arr.length : 0;

        const getMedian = (arr) => {
            if (!arr.length) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        const getStdDev = (arr, mean) => {
            if (arr.length < 2) return 0;
            const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (arr.length - 1);
            return Math.sqrt(variance);
        };

        const getCV = (mean, stdDev) => {
            if (mean === 0) return 0;
            return (stdDev / mean);
        };

        const formatCV = (cv) => {
            const percent = (cv * 100).toFixed(1) + '%';
            let msg = "";
            let color = "#28a745";
            if (cv > 0.15) {
                msg = "⚠️ Fiyatlar tutarsız (Pazarlık payı yüksek)";
                color = "#dc3545";
            } else {
                msg = "✅ Fiyatlar tutarlı";
            }
            return { text: percent, msg, color };
        };

        // --- Birim Fiyat İstatistikleri (Kiralık) ---
        const priceMean = getMean(priceM2List);
        const priceMedian = getMedian(priceM2List);
        const priceStd = getStdDev(priceM2List, priceMean);
        const priceCV = getCV(priceMean, priceStd);
        const priceCVInfo = formatCV(priceCV);

        // --- Aidat/m² İstatistikleri (Genel) ---
        const aidatMean = getMean(aidatM2List);
        const aidatMedian = getMedian(aidatM2List);
        const aidatStd = getStdDev(aidatM2List, aidatMean);
        const aidatCV = getCV(aidatMean, aidatStd);
        const aidatCVInfo = formatCV(aidatCV);

        // --- DOM Güncellemeleri ---
        document.getElementById('totalCount').innerText = totalCount;

        const pMean = priceMean.toFixed(2);
        const pMed = priceMedian.toFixed(2);
        const pMeanConv = (rate > 0) ? (priceMean * rate).toFixed(0) : '-';
        const pMedConv = (rate > 0) ? (priceMedian * rate).toFixed(0) : '-';

        document.getElementById('avgPriceM2').innerHTML = `${pMean} ₺ <br><small style="color:#28a745; font-size:11px;">${symbol}${pMeanConv}</small>`;
        document.getElementById('medPriceM2').innerHTML = `${pMed} ₺ <br><small style="color:#28a745; font-size:11px;">${symbol}${pMedConv}</small>`;
        const cvPriceEl = document.getElementById('cvPriceM2');
        cvPriceEl.innerText = priceCVInfo.text;
        cvPriceEl.style.color = priceCVInfo.color;
        document.getElementById('cvPriceMsg').innerText = priceCVInfo.msg;

        const aMean = aidatMean.toFixed(2);
        const aMed = aidatMedian.toFixed(2);
        const aMeanConv = (rate > 0) ? (aidatMean * rate).toFixed(2) : '-';
        const aMedConv = (rate > 0) ? (aidatMedian * rate).toFixed(2) : '-';

        document.getElementById('avgAidatM2').innerHTML = `${aMean} ₺ <br><small style="color:#28a745; font-size:11px;">${symbol}${aMeanConv}</small>`;
        document.getElementById('medAidatM2').innerHTML = `${aMed} ₺ <br><small style="color:#28a745; font-size:11px;">${symbol}${aMedConv}</small>`;
        const cvAidatEl = document.getElementById('cvAidatM2');
        cvAidatEl.innerText = aidatCVInfo.text;
        cvAidatEl.style.color = aidatCVInfo.color;
        document.getElementById('cvAidatMsg').innerText = aidatCVInfo.msg;

        // Geçmiş Karşılaştırmalar
        StatsModule.updateComparison('histPrice3m', 'resPrice3m', priceMean);
        StatsModule.updateComparison('histPrice6m', 'resPrice6m', priceMean);
        StatsModule.updateComparison('histPrice1y', 'resPrice1y', priceMean);

        StatsModule.updateComparison('histAidat3m', 'resAidat3m', aidatMean);
        StatsModule.updateComparison('histAidat6m', 'resAidat6m', aidatMean);
        StatsModule.updateComparison('histAidat1y', 'resAidat1y', aidatMean);

        StatsModule.updateIntervals('histPrice3m', 'histPrice6m', 'intPrice3m');
        StatsModule.updateIntervals('histPrice6m', 'histPrice1y', 'intPrice6m');

        StatsModule.updateIntervals('histAidat3m', 'histAidat6m', 'intAidat3m');
        StatsModule.updateIntervals('histAidat6m', 'histAidat1y', 'intAidat6m');

        StatsModule.setupHistListeners(priceMean, aidatMean);
    },

    updateComparison(inputId, resId, currentVal) {
        let inputValStr = document.getElementById(inputId).value;
        const resEl = document.getElementById(resId);

        if (!inputValStr) {
            resEl.innerText = '-';
            resEl.style.color = '#333';
            return;
        }

        const cleanVal = inputValStr.toString().replace(/\./g, '').replace(/,/g, '.');
        const inputVal = parseFloat(cleanVal) || 0;

        if (inputVal <= 0 || currentVal === 0) {
            resEl.innerText = '-';
            resEl.style.color = '#333';
            return;
        }

        const diff = ((currentVal - inputVal) / inputVal) * 100;
        const sign = diff > 0 ? '+' : '';
        resEl.innerText = `${sign}${diff.toFixed(1)}%`;
        resEl.style.color = diff > 0 ? '#28a745' : (diff < 0 ? '#dc3545' : '#333');
    },

    updateIntervals(recentInputId, olderInputId, resId) {
        const clean = (val) => {
            if (!val) return 0;
            return parseFloat(val.toString().replace(/\./g, '').replace(/,/g, '.')) || 0;
        };

        const recentVal = clean(document.getElementById(recentInputId).value);
        const olderVal = clean(document.getElementById(olderInputId).value);
        const resEl = document.getElementById(resId);

        if (!recentVal || !olderVal || olderVal <= 0) {
            resEl.innerText = '-';
            resEl.style.color = '#ccc';
            return;
        }

        const diff = ((recentVal - olderVal) / olderVal) * 100;
        const sign = diff > 0 ? '+' : '';
        resEl.innerText = `${sign}${diff.toFixed(1)}%`;
        resEl.style.color = diff > 0 ? '#28a745' : (diff < 0 ? '#dc3545' : '#333');
    },

    setupHistListeners(priceMean, aidatMean) {
        const inputs = [
            'histPrice3m', 'histPrice6m', 'histPrice1y',
            'histAidat3m', 'histAidat6m', 'histAidat1y'
        ];

        inputs.forEach(id => {
            const el = document.getElementById(id);
            el.oninput = () => {
                StatsModule.updateComparison('histPrice3m', 'resPrice3m', priceMean);
                StatsModule.updateComparison('histPrice6m', 'resPrice6m', priceMean);
                StatsModule.updateComparison('histPrice1y', 'resPrice1y', priceMean);

                StatsModule.updateComparison('histAidat3m', 'resAidat3m', aidatMean);
                StatsModule.updateComparison('histAidat6m', 'resAidat6m', aidatMean);
                StatsModule.updateComparison('histAidat1y', 'resAidat1y', aidatMean);

                StatsModule.updateIntervals('histPrice3m', 'histPrice6m', 'intPrice3m');
                StatsModule.updateIntervals('histPrice6m', 'histPrice1y', 'intPrice6m');

                StatsModule.updateIntervals('histAidat3m', 'histAidat6m', 'intAidat3m');
                StatsModule.updateIntervals('histAidat6m', 'histAidat1y', 'intAidat6m');
            };
        });
    }
};

// Backward compat: eski çağrılar için global alias'lar
function calculateStats(data, rate, symbol) { StatsModule.calculateStats(data, rate, symbol); }
function updateComparison(inputId, resId, currentVal) { StatsModule.updateComparison(inputId, resId, currentVal); }
function updateIntervals(recentInputId, olderInputId, resId) { StatsModule.updateIntervals(recentInputId, olderInputId, resId); }
function setupHistListeners(priceMean, aidatMean) { StatsModule.setupHistListeners(priceMean, aidatMean); }
