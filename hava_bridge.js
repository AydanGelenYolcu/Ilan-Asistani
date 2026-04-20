// hava_bridge.js — ISOLATED world messaging bridge
// Manifest V3'te iki dünya arasında köprü kurar:
//   MAIN world (hava_content.js, jQuery/Kendo erişimi var, chrome.runtime YOK)
//   ISOLATED world (bu dosya, chrome.runtime var, sayfa JS'i YOK)
//
// MAIN → chrome.runtime: hava_content'ten gelen progress/done mesajları
// chrome.runtime → MAIN: START_SCRAPING / STOP_SCRAPING komutları

(function () {
    if (window._havaBridgeInitialized) return;
    window._havaBridgeInitialized = true;

    // 1. MAIN world → chrome.runtime
    //    hava_content.js, window.postMessage({__havaFromMain: true, payload: ...}) gönderir
    //    Biz bunu yakalayıp chrome.runtime.sendMessage'a iletiyoruz
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || !event.data.__havaFromMain) return;
        try {
            chrome.runtime.sendMessage(event.data.payload);
        } catch (_) {}
    });

    // 2. chrome.runtime → MAIN world
    //    dashboard.js, chrome.tabs.sendMessage ile START_SCRAPING / STOP_SCRAPING gönderir
    //    Biz bunu MAIN world'e window.postMessage ile iletiyoruz
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (['START_SCRAPING', 'STOP_SCRAPING', 'PAUSE_SCRAPING', 'RESUME_SCRAPING'].includes(msg.type)) {
            window.postMessage({ __havaToMain: true, payload: msg }, '*');
            sendResponse({ ok: true });
        }
        return true;
    });
})();
