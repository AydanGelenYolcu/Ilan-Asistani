// Content script'lerden gelen keepalive bağlantısını kabul et.
// Bu bağlantı sayfa açık kaldığı sürece Service Worker'ı uyanık tutar.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'keepalive') {
        // Bağlantıyı açık tut — fazladan bir şey yapmaya gerek yok.
        port.onDisconnect.addListener(() => { /* sessizce geç */ });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        // SW'yi uyandırmak için kullanılır — yanıt vermeye gerek yok.
        return;
    }
    if (request.action === 'OPEN_DASHBOARD') {
        chrome.tabs.create({ url: 'dashboard.html' });
    }
    if (request.action === 'REFRESH_EXCHANGE_RATE') {
        updateExchangeRate();
    }

    // Hava kalitesi mesaj köprüsü:
    // Content script (sim.csb.gov.tr) -> background -> dashboard
    // Manifest V3'te content script mesajları doğrudan extension sayfasına ulaşmaz,
    // background üzerinden forward edilmesi gerekir.
    const HAVA_TYPES = ['HAVA_CONTENT_READY', 'HAVA_STATIONS_LOADED', 'HAVA_PROGRESS', 'HAVA_DONE', 'HAVA_ERROR', 'HAVA_PAUSED', 'HAVA_RESUMED', 'HAVA_RETRY_START'];
    if (HAVA_TYPES.includes(request.type)) {
        // Tüm extension sekmelerini bul ve mesajı ilet
        chrome.tabs.query({ url: chrome.runtime.getURL('dashboard.html') }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, request).catch(() => {});
            });
        });
    }
});

// Exchange Rate Logic
const API_URL = 'https://open.er-api.com/v6/latest/TRY';
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function updateExchangeRate() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data && data.rates) {
            // We store the 1 TRY = X rates. 
            // the dashboard will do 1 / rates[CUR] to get 1 CUR = Y TRY
            const rateData = {
                allRates: data.rates,
                timestamp: Date.now()
            };

            chrome.storage.local.set({ exchangeRate: rateData }, () => {
                console.log('All Exchange Rates Updated:', rateData);
            });
        }
    } catch (e) {
        console.error('Failed to fetch exchange rate:', e);
    }
}

// Update on install/startup
chrome.runtime.onInstalled.addListener(updateExchangeRate);
chrome.runtime.onStartup.addListener(updateExchangeRate);

// Alarm ve dinleyici
chrome.alarms.create('refreshRate', { periodInMinutes: 60 }); // Kur güncelleme
chrome.alarms.create('keepAlive',   { periodInMinutes: 1  }); // SW uyanık tut

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'refreshRate') updateExchangeRate();
    // 'keepAlive' alarmı yalnızca SW'yi uyandırmaya yarar, başka işlem yok.
});
