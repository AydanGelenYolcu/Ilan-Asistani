// ══════════════════════════════════════════════════════════════════════════════
// HAVA KALİTESİ MODÜLÜ
// ══════════════════════════════════════════════════════════════════════════════

let havaScraperTabId = null;
let havaAllData = [];
let havaAllSessions = [];
let havaActiveSessionId = null;
let havaCurrentStartDate = null;
let havaCurrentEndDate = null;
let havaCurrentParamName = 'PM10';
let havaIsRunning = false;
let havaIsPaused = false;
let havaProgressListener = null;
let havaLastCompletedIndex = 0;
let havaCurrentPeriod = '8';
let havaCurrentCities = null;
let havaCurrentStations = null;
let havaCurrentParamNames = ['PM10'];
let havaResumingSessionId = null;
let havaStopRequested = false;
let _havaNavGuard = null;
let _havaTabPingInterval = null;

// ── Sekme Ping ────────────────────────────────────────────────────────────────
// Extension page (dashboard) Chrome'un background tab throttle'ına daha az maruz
// kalır. Buradan scraping sekmesine saniyede bir mesaj göndermek Chrome'un sekmeyi
// "aktif bağlantısı olan" olarak değerlendirmesini ve freeze etmemesini sağlar.
function _havaStartTabPing(tabId) {
    _havaStopTabPing();
    _havaTabPingInterval = setInterval(() => {
        if (tabId) chrome.tabs.sendMessage(tabId, { type: 'HAVA_PING' }).catch(() => {});
    }, 1000);
}
function _havaStopTabPing() {
    if (_havaTabPingInterval) { clearInterval(_havaTabPingInterval); _havaTabPingInterval = null; }
}

// ── Navigasyon Koruyucu ───────────────────────────────────────────────────────
// Hava scraper sekmesi başka bir URL'ye giderse otomatik olarak geri döner
// ve scriptleri yeniden enjekte ederek kaldığı yerden devam eder.

const _HAVA_TARGET_URL = 'https://sim.csb.gov.tr/STN/STN_Report/StationDataDownloadNew';

function _havaInstallNavGuard() {
    _havaRemoveNavGuard(); // Varsa eskiyi temizle
    let _redirecting = false;

    _havaNavGuard = async (tabId, changeInfo) => {
        if (tabId !== havaScraperTabId) return;

        // Sekme farklı bir URL'ye yönlendiyse geri al
        if (changeInfo.url && !changeInfo.url.includes('sim.csb.gov.tr')) {
            if (_redirecting) return;
            _redirecting = true;
            havaLog('⚠️ Sekme hata ile farklı sayfaya yönlendi. Geri dönülüyor...');
            chrome.tabs.update(tabId, { url: _HAVA_TARGET_URL });
            return;
        }

        // Yönlendirme sonrası sayfa tamamen yüklenince scriptleri yeniden enjekte et
        if (_redirecting && changeInfo.status === 'complete') {
            _redirecting = false;
            havaLog('🔄 Sayfa yüklendi, scriptler yeniden enjekte ediliyor...');
            await havaSleep(4000); // Kendo widget başlatma süresi
            try {
                await chrome.scripting.executeScript({ target: { tabId }, files: ['hava_bridge.js'] });
                await chrome.scripting.executeScript({ target: { tabId }, files: ['hava_content.js'], world: 'MAIN' });
                chrome.tabs.sendMessage(tabId, {
                    type: 'START_SCRAPING',
                    config: {
                        period: havaCurrentPeriod,
                        startDate: havaCurrentStartDate,
                        endDate: havaCurrentEndDate,
                        paramNames: havaCurrentParamNames,
                        paramName: havaCurrentParamName,
                        cities: havaCurrentCities,
                        stations: havaCurrentStations,
                        startFromIndex: havaLastCompletedIndex
                    }
                }).catch(() => {});
                havaLog(`▶ ${havaLastCompletedIndex}. istasyondan devam ediliyor...`);
            } catch (e) {
                havaLog('❌ Yeniden enjeksiyon başarısız: ' + e.message);
            }
        }
    };

    chrome.tabs.onUpdated.addListener(_havaNavGuard);
}

function _havaRemoveNavGuard() {
    if (_havaNavGuard) {
        chrome.tabs.onUpdated.removeListener(_havaNavGuard);
        _havaNavGuard = null;
    }
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

// MessageChannel tabanlı sleep — setTimeout gibi Chrome throttling'inden etkilenmez.
// Dashboard arka planda açıkken 4000ms yazılan bekleme gerçekten 4sn sürer, ~1sn'ye dönmez.
const _havaMC = (() => {
    const ch = new MessageChannel();
    const cbs = [];
    ch.port1.onmessage = () => { const fn = cbs.shift(); if (fn) fn(); };
    return { tick: () => new Promise(r => { cbs.push(r); ch.port2.postMessage(null); }) };
})();

function havaSleep(ms) {
    const end = Date.now() + ms;
    return (async () => { do { await _havaMC.tick(); } while (Date.now() < end); })();
}

function havaLog(msg) {
    const box = document.getElementById('havaLogBox');
    if (!box) return;
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
}

function havaUpdateProgress(current, total, grupName, sehirName, istasyonName) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const bar = document.getElementById('havaProgressBar');
    const txt = document.getElementById('havaProgressText');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = `${grupName} › ${sehirName} › ${istasyonName}  —  ${current}/${total} (%${pct})`;
}

function havaFormatDate(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function havaGetDateRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start: havaFormatDate(start), end: havaFormatDate(end) };
}

// ── Storage ───────────────────────────────────────────────────────────────────

function havaSaveAllSessions(cb) {
    chrome.storage.local.set({ havaKalitesiSessions: havaAllSessions }, cb || (() => {}));
}

function havaLoadAllSessions() {
    chrome.storage.local.get(['havaKalitesiSessions', 'havaKalitesiData', 'havaKalitesiMeta'], (result) => {
        havaAllSessions = result.havaKalitesiSessions || [];

        // Eski format migrasyonu: tek oturum varsa sessions'a taşı
        if (havaAllSessions.length === 0 && result.havaKalitesiData && result.havaKalitesiData.length > 0) {
            const meta = result.havaKalitesiMeta || {};
            havaAllSessions = [{
                id: 'hava_migrated_' + Date.now(),
                name: '✅ ' + (meta.lastDate || 'Eski Analiz'),
                meta: { ...meta, count: result.havaKalitesiData.length },
                data: result.havaKalitesiData
            }];
            havaSaveAllSessions();
        }

        if (havaAllSessions.length > 0) {
            havaActiveSessionId = havaAllSessions[havaAllSessions.length - 1].id;
            havaAllData = havaAllSessions.find(s => s.id === havaActiveSessionId)?.data || [];
            document.getElementById('havaSavedSection').style.display = 'block';
            havaRenderSessionTabs();
            const active = havaAllSessions.find(s => s.id === havaActiveSessionId);
            if (active) havaShowSavedSection(active.meta);
        }
    });
}

function havaRenderSessionTabs() {
    const container = document.getElementById('havaSessionTabs');
    if (!container) return;
    container.innerHTML = '';

    [...havaAllSessions].reverse().forEach(session => {
        const wrap = document.createElement('div');
        wrap.className = 'hava-session-tab' + (session.id === havaActiveSessionId ? ' active' : '');

        const canResume = session.meta.partial && session.meta.scrapingConfig;
        wrap.innerHTML = `
            <div class="hava-session-tab-body">
                <span class="hava-session-name" title="Çift tıkla: yeniden adlandır">${session.name}</span>
                <span class="hava-session-meta">${session.meta.count} kayıt${session.meta.partial ? ' · kısmi' : ''}</span>
                ${canResume ? '<button class="hava-session-resume-btn" title="Kaldığı yerden devam et">▶ Devam Et</button>' : ''}
            </div>
            <button class="hava-session-del-btn" title="Bu oturumu sil">×</button>
        `;

        wrap.querySelector('.hava-session-tab-body').addEventListener('click', () => havaSelectSession(session.id));
        if (canResume) {
            wrap.querySelector('.hava-session-resume-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                havaResumeSession(session.id);
            });
        }

        wrap.querySelector('.hava-session-name').addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const newName = prompt('Oturum adı:', session.name);
            if (newName && newName.trim()) {
                session.name = newName.trim();
                havaSaveAllSessions();
                havaRenderSessionTabs();
            }
        });

        wrap.querySelector('.hava-session-del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`"${session.name}" silinsin mi?`)) havaDeleteSession(session.id);
        });

        container.appendChild(wrap);
    });
}

function havaSelectSession(id) {
    havaActiveSessionId = id;
    const session = havaAllSessions.find(s => s.id === id);
    if (!session) return;
    havaAllData = session.data;
    havaRenderSessionTabs();
    havaShowSavedSection(session.meta);
}

function havaDeleteSession(id) {
    havaAllSessions = havaAllSessions.filter(s => s.id !== id);
    havaSaveAllSessions();
    if (havaAllSessions.length === 0) {
        havaActiveSessionId = null;
        havaAllData = [];
        document.getElementById('havaSavedSection').style.display = 'none';
    } else {
        if (havaActiveSessionId === id) {
            havaActiveSessionId = havaAllSessions[havaAllSessions.length - 1].id;
            havaAllData = havaAllSessions.find(s => s.id === havaActiveSessionId)?.data || [];
        }
        havaRenderSessionTabs();
        const active = havaAllSessions.find(s => s.id === havaActiveSessionId);
        if (active) havaShowSavedSection(active.meta);
    }
}

function havaFormatSessionName(partial) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const timeStr = `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
    return (partial ? '⏸ ' : '✅ ') + timeStr;
}

function havaShowDataTab(tab) {
    const cityPanel    = document.getElementById('havaTabCity');
    const stationPanel = document.getElementById('havaTabStation');
    const cityBtn      = document.getElementById('havaTabCityBtn');
    const stationBtn   = document.getElementById('havaTabStationBtn');
    if (!cityPanel) return;
    const isCity = tab === 'city';
    cityPanel.style.display    = isCity ? '' : 'none';
    stationPanel.style.display = isCity ? 'none' : '';
    cityBtn.style.background    = isCity ? 'var(--primary-color)' : 'var(--border-color)';
    cityBtn.style.color         = isCity ? '#fff' : 'var(--text-color)';
    stationBtn.style.background = isCity ? 'var(--border-color)' : 'var(--primary-color)';
    stationBtn.style.color      = isCity ? 'var(--text-color)' : '#fff';
}

function havaShowSavedSection(meta) {
    const sec = document.getElementById('havaSavedSection');
    if (sec) sec.style.display = 'block';
    const el = (id) => document.getElementById(id);
    if (el('havaTotalCount')) el('havaTotalCount').textContent = havaAllData.length;
    if (meta && el('havaLastDate')) el('havaLastDate').textContent = meta.lastDate || '-';
    if (meta && el('havaDateRange')) el('havaDateRange').textContent = (meta.startDate || '-') + '\n— ' + (meta.endDate || '-');
    // Başlıkları parametre adına göre güncelle
    const param = (meta && meta.paramName) || havaCurrentParamName || 'PM10';
    havaUpdateMainTitle(param);
    if (el('havaCityTableTitle'))   el('havaCityTableTitle').textContent   = `Şehir Bazlı ${param} Özeti`;
    if (el('havaStationTableTitle')) el('havaStationTableTitle').textContent = `İstasyon Bazlı ${param} Detayı`;
    if (el('havaCityAvgHeader'))    el('havaCityAvgHeader').textContent    = `Ort. ${param}`;
    havaRenderCityTable();
    havaRenderStationTable();
}

function havaRenderStationTable() {
    const tbody = document.getElementById('havaStationTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (const row of havaAllData) {
        const tr = document.createElement('tr');
        if (row.noData) tr.style.opacity = '0.45';
        const fmt = v => (v === 'NaN' || v == null) ? 'NaN' : v;
        const fmtDate = v => {
            if (!v || v === 'NaN') return 'NaN';
            // ISO tarihi daha okunabilir yap: 2026-03-11T21:00:00.000Z → 11.03.2026 00:00
            try {
                const d = new Date(v);
                if (isNaN(d)) return v;
                return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            } catch { return v; }
        };
        tr.innerHTML = `
            <td>${row.grup || ''}</td>
            <td>${row.sehir || ''}</td>
            <td>${row.istasyon || ''}</td>
            <td>${row.ParameterText || row.paramName || ''}</td>
            <td>${row.Unit_Title || ''}</td>
            <td style="text-align:right;">${fmt(row.Min)}</td>
            <td style="text-align:right; font-size:11px;">${fmtDate(row.MinDate)}</td>
            <td style="text-align:right;">${fmt(row.Max)}</td>
            <td style="text-align:right; font-size:11px;">${fmtDate(row.MaxDate)}</td>
            <td style="text-align:right; font-weight:bold; color:var(--primary-color);">${fmt(row.Avg)}</td>
            <td style="text-align:center;">${fmt(row.Count)}</td>
            <td style="text-align:center;">${fmt(row.MustBeCount)}</td>
            <td style="text-align:right;">${row.Percent === 'NaN' || row.Percent == null ? 'NaN' : row.Percent + '%'}</td>
            <td>${row.periyot || ''}</td>
        `;
        tbody.appendChild(tr);
    }
}

function havaRenderCityTable() {
    const cityMap = {};
    for (const row of havaAllData) {
        if (row.noData) continue;
        const key = (row.grup || '') + '|||' + (row.sehir || '');
        if (!cityMap[key]) {
            cityMap[key] = { grup: row.grup || '', sehir: row.sehir || '', mins: [], maxes: [], avgs: [], percents: [] };
        }
        if (row.Min != null) cityMap[key].mins.push(parseFloat(row.Min) || 0);
        if (row.Max != null) cityMap[key].maxes.push(parseFloat(row.Max) || 0);
        if (row.Avg != null) cityMap[key].avgs.push(parseFloat(row.Avg) || 0);
        if (row.Percent != null) cityMap[key].percents.push(parseFloat(row.Percent) || 0);
    }

    const tbody = document.getElementById('havaCityTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';

    Object.values(cityMap)
        .sort((a, b) => (a.grup + a.sehir).localeCompare(b.grup + b.sehir, 'tr'))
        .forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.grup}</td>
                <td>${c.sehir}</td>
                <td style="text-align:center;">${c.avgs.length}</td>
                <td style="text-align:right;">${avg(c.mins)}</td>
                <td style="text-align:right;">${avg(c.maxes)}</td>
                <td style="text-align:right; font-weight:bold; color:var(--primary-color);">${avg(c.avgs)}</td>
                <td style="text-align:right;">${avg(c.percents)}%</td>`;
            tbody.appendChild(tr);
        });
}

// ── Canlı Tablo Güncelleme ────────────────────────────────────────────────────

/**
 * Analiz devam ederken her istasyon verisinde çağrılır.
 * havaSavedSection'ı gösterir, sayacı ve tabloları anlık günceller.
 */
/** Checkbox'lardan seçili parametreleri string[] olarak döner. */
function havaGetSelectedParams() {
    const checks = document.querySelectorAll('.hava-param-check:checked');
    const vals = Array.from(checks).map(c => c.value);
    return vals.length > 0 ? vals : ['PM10'];
}

function havaUpdateMainTitle(param) {
    const el = document.getElementById('havaMainTitle');
    if (el) el.textContent = param || havaCurrentParamName || 'PM10';
}

function havaUpdateLiveTables() {
    const sec = document.getElementById('havaSavedSection');
    if (sec) sec.style.display = 'block';

    const el = id => document.getElementById(id);
    if (el('havaTotalCount')) el('havaTotalCount').textContent = havaAllData.length;

    const param = havaCurrentParamName || 'PM10';
    havaUpdateMainTitle(param);
    if (el('havaCityTableTitle'))    el('havaCityTableTitle').textContent    = `Şehir Bazlı ${param} Özeti`;
    if (el('havaStationTableTitle')) el('havaStationTableTitle').textContent = `İstasyon Bazlı ${param} Detayı`;
    if (el('havaCityAvgHeader'))     el('havaCityAvgHeader').textContent     = `Ort. ${param}`;
    if (el('havaDateRange'))         el('havaDateRange').textContent         = (havaCurrentStartDate || '-') + '\n— ' + (havaCurrentEndDate || '-');

    havaRenderCityTable();
    havaRenderStationTable();
}

// ── Analizi Başlat ────────────────────────────────────────────────────────────

function havaFinish(startDate, endDate) {
    havaIsRunning = false;
    if (havaScraperTabId) { chrome.tabs.remove(havaScraperTabId); havaScraperTabId = null; }

    const sessionId = 'hava_' + Date.now();
    const meta = { lastDate: new Date().toLocaleString('tr-TR'), startDate, endDate, count: havaAllData.length, partial: false, paramName: havaCurrentParamName };
    havaAllSessions.push({ id: sessionId, name: havaFormatSessionName(false), meta, data: [...havaAllData] });
    havaActiveSessionId = sessionId;

    havaSaveAllSessions(() => {
        havaLog(`✅ Tamamlandı! ${havaAllData.length} kayıt kaydedildi.`);
        document.querySelector('.hava-progress-bar-wrap').style.display = 'none';
        document.getElementById('havaProgressText').style.display = 'none';
        havaResetUI();
        havaRenderSessionTabs();
        havaShowSavedSection(meta);
    });
}

function havaResetUI() {
    _havaRemoveNavGuard();
    _havaStopTabPing();
    havaIsRunning = false;
    havaIsPaused = false;
    document.getElementById('havaStartBtn').style.display = 'inline-flex';
    const pauseBtn = document.getElementById('havaPauseBtn');
    pauseBtn.style.display = 'none';
    pauseBtn.disabled = false;
    pauseBtn.textContent = '⏸ Duraklat';
    document.getElementById('havaResumeBtn').style.display = 'none';
    const stopBtn = document.getElementById('havaStopBtn');
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    stopBtn.textContent = '⏹ Durdur';
}

// ── Devam Et (Resume) ─────────────────────────────────────────────────────────

/** Mevcut oturumu tamamlanmış olarak günceller (resume sonrası). */
function havaFinishResume(sessionId, startDate, endDate) {
    havaIsRunning = false;
    havaResumingSessionId = null;
    _havaRemoveNavGuard();
    if (havaScraperTabId) { chrome.tabs.remove(havaScraperTabId); havaScraperTabId = null; }

    const session = havaAllSessions.find(s => s.id === sessionId);
    if (session) {
        session.data = [...havaAllData];
        session.meta.count = havaAllData.length;
        session.meta.partial = false;
        session.meta.lastDate = new Date().toLocaleString('tr-TR');
        delete session.meta.lastCompletedIndex;
        delete session.meta.scrapingConfig;
        session.name = havaFormatSessionName(false);
    }

    havaSaveAllSessions(() => {
        havaLog(`✅ Tamamlandı! Toplam ${havaAllData.length} kayıt kaydedildi.`);
        document.querySelector('.hava-progress-bar-wrap').style.display = 'none';
        document.getElementById('havaProgressText').style.display = 'none';
        havaResetUI();
        havaRenderSessionTabs();
        const active = havaAllSessions.find(s => s.id === sessionId);
        if (active) havaShowSavedSection(active.meta);
    });
}

/** Kısmi bir oturumu kaldığı yerden devam ettirir. */
async function havaResumeSession(id) {
    if (havaIsRunning) { alert('Önce devam eden analizi durdurun.'); return; }

    const session = havaAllSessions.find(s => s.id === id);
    if (!session || !session.meta.scrapingConfig) return;

    const config = session.meta.scrapingConfig;
    const startFromIndex = session.meta.lastCompletedIndex || 0;

    havaActiveSessionId = id;
    havaAllData = [...session.data];
    havaLastCompletedIndex = startFromIndex;
    havaCurrentStartDate = config.startDate;
    havaCurrentEndDate = config.endDate;
    havaCurrentParamName = config.paramName;
    havaCurrentPeriod = config.period;
    havaCurrentCities = config.cities;
    havaCurrentStations = config.stations;
    havaResumingSessionId = id;
    havaStopRequested = false;
    havaIsRunning = true;
    havaIsPaused = false;

    document.getElementById('havaProgress').style.display = 'block';
    document.querySelector('.hava-progress-bar-wrap').style.display = '';
    document.getElementById('havaProgressText').style.display = '';
    document.getElementById('havaStartBtn').style.display = 'none';
    document.getElementById('havaPauseBtn').style.display = 'inline-flex';
    document.getElementById('havaResumeBtn').style.display = 'none';
    document.getElementById('havaStopBtn').style.display = 'inline-flex';
    document.getElementById('havaLogBox').innerHTML = '';
    // Mevcut veriyi hemen göster — resume'da gizlemek yerine anlık tablolar güncellenir
    havaUpdateLiveTables();

    const totalStations = (config.stations || []).length;
    const remaining = totalStations - startFromIndex;
    havaLog(`▶ Kaldığı yerden devam ediliyor: ${startFromIndex}. istasyondan itibaren (~${remaining} istasyon kaldı)`);
    havaLog(`Parametre: ${config.paramName} | Periyot: ${config.period === '8' ? 'Saatlik' : 'Günlük'} | ${config.startDate} — ${config.endDate}`);

    try {
        const tab = await new Promise(resolve =>
            chrome.tabs.create({ url: 'https://sim.csb.gov.tr/STN/STN_Report/StationDataDownloadNew', active: false }, resolve)
        );
        havaScraperTabId = tab.id;
        chrome.tabs.update(tab.id, { autoDiscardable: false }); // Chrome'un sekmeyi uyutmasını engelle
        _havaInstallNavGuard();
        _havaStartTabPing(tab.id); // Dashboard'dan saniyede bir ping → freeze önleme

        await new Promise((resolve, reject) => {
            const giveUpTimer = setTimeout(() => reject(new Error('Sayfa yüklenemedi (60sn)')), 60000);
            const listener = (tabId, info) => {
                if (tabId === havaScraperTabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    clearTimeout(giveUpTimer);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });

        havaLog('Sayfa yüklendi, scriptler hazırlanıyor...');
        await havaSleep(4000);

        await chrome.scripting.executeScript({ target: { tabId: havaScraperTabId }, files: ['hava_bridge.js'] });
        await chrome.scripting.executeScript({ target: { tabId: havaScraperTabId }, files: ['hava_content.js'], world: 'MAIN' });

        havaLog(`Script yüklendi, ${startFromIndex}. istasyondan devam ediliyor...`);

        const _seenProgress = new Set();
        havaProgressListener = (msg) => {
            if (msg.type === 'HAVA_RETRY_START') {
                havaLog(`🔄 ${msg.count} NaN istasyon yeniden sorgulanıyor...`);
                havaUpdateProgress(0, msg.count, 'Retry', '', '');
            }
            if (msg.type === 'HAVA_PROGRESS') {
                // Retry mesajları için ayrı dedup anahtarı ('r:N'), aksi halde ana tur ile çakışır
                const _deupKey = msg.retry ? ('r:' + msg.current) : msg.current;
                if (_seenProgress.has(_deupKey)) return;
                _seenProgress.add(_deupKey);
                if (msg.data && !msg.error) {
                    if (msg.retry) {
                        // Retry: mevcut satırları güncelle (push değil replace)
                        const newRows = Array.isArray(msg.data) ? msg.data : [msg.data];
                        for (const nr of newRows) {
                            const idx = havaAllData.findIndex(r =>
                                r.istasyon === nr.istasyon &&
                                r.sehir    === nr.sehir    &&
                                r.grup     === nr.grup     &&
                                (r.ParameterText || r.paramName) === (nr.ParameterText || nr.paramName)
                            );
                            if (idx >= 0) havaAllData[idx] = nr;
                            else havaAllData.push(nr);
                        }
                    } else {
                        Array.isArray(msg.data) ? havaAllData.push(...msg.data) : havaAllData.push(msg.data);
                    }
                    havaUpdateLiveTables();
                }
                if (!msg.retry) havaLastCompletedIndex = msg.current;
                havaUpdateProgress(msg.current, msg.total, msg.grupName, msg.sehirName, msg.istasyonName);
                const _retryGotData = msg.retry && Array.isArray(msg.data) ? msg.data.some(d => !d.noData) : (msg.retry && msg.data && !msg.data.noData);
                if (msg.error) {
                    havaLog(`⚠️ ${msg.retry ? '[Retry] ' : ''}${msg.sehirName} › ${msg.istasyonName} — ${msg.error}`);
                } else if (msg.retry) {
                    havaLog(`🔄 Retry ${msg.current}/${msg.total}: ${msg.sehirName} › ${msg.istasyonName} — ${_retryGotData ? '✓ veri geldi' : 'hâlâ NaN'}`);
                } else {
                    havaLog(`✓ ${msg.grupName} › ${msg.sehirName} › ${msg.istasyonName} (${msg.current}/${msg.total})`);
                }
            }
            if (msg.type === 'HAVA_ERROR') havaLog(`❌ Hata: ${msg.error}`);
            if (msg.type === 'HAVA_PAUSED') {
                havaIsPaused = true;
                document.getElementById('havaPauseBtn').style.display = 'none';
                document.getElementById('havaResumeBtn').style.display = 'inline-flex';
                document.getElementById('havaProgressText').textContent += '  — ⏸ Duraklatıldı';
                havaLog('⏸ Analiz duraklatıldı. "▶ Devam Et" ile sürdürün.');
                havaShowSavedSection({ lastDate: new Date().toLocaleString('tr-TR'), startDate: havaCurrentStartDate, endDate: havaCurrentEndDate, count: havaAllData.length, partial: true, paramName: havaCurrentParamName });
            }
            if (msg.type === 'HAVA_RESUMED') {
                havaIsPaused = false;
                document.getElementById('havaPauseBtn').style.display = 'inline-flex';
                document.getElementById('havaResumeBtn').style.display = 'none';
                havaLog('▶ Analiz devam ediyor...');
            }
            if (msg.type === 'HAVA_DONE') {
                if (havaProgressListener) chrome.runtime.onMessage.removeListener(havaProgressListener);
                havaProgressListener = null;
                if (!havaStopRequested) {
                    havaFinishResume(id, config.startDate, config.endDate);
                } else {
                    if (havaScraperTabId) { chrome.tabs.remove(havaScraperTabId); havaScraperTabId = null; }
                    havaResetUI();
                    havaResumingSessionId = null;
                }
            }
        };
        chrome.runtime.onMessage.addListener(havaProgressListener);

        chrome.tabs.sendMessage(havaScraperTabId, {
            type: 'START_SCRAPING',
            config: { ...config, startFromIndex }
        }).catch(() => {});

    } catch (err) {
        havaLog('❌ ' + err.message);
        havaResetUI();
        havaResumingSessionId = null;
    }
}

// ── Excel İndir ───────────────────────────────────────────────────────────────

function havaDownloadExcel() {
    if (!havaAllData || havaAllData.length === 0) { alert('İndirilecek veri yok.'); return; }

    const wb = XLSX.utils.book_new();
    const numFmt = n => (n == null || n === '') ? '' : n;
    const avg = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : '';

    // Aktif oturumun parametre adı — çoklu olabilir ("PM10 + SO2")
    const activeParam = (havaAllSessions.find(s => s.id === havaActiveSessionId) || {}).meta?.paramName
        || havaCurrentParamName
        || 'Parametre';

    // ── Sayfa 1: Ham Veri ──────────────────────────────────────────────────
    const h1 = ['İstasyon Grubu', 'Şehir', 'İstasyon Adı', 'Parametre', 'Birim',
        'Min Değer', 'Min Tarihi', 'Max Değer', 'Max Tarihi', 'Ort. Değer',
        'Veri Adedi', 'Olması Gereken', 'Veri %', 'Std. Sapma', 'Toplam',
        'Periyot', 'Başlangıç Tarihi', 'Bitiş Tarihi'];

    const rows1 = havaAllData.map(r => [
        r.grup || '', r.sehir || '', r.istasyon || '',
        r.ParameterText || r.paramName || activeParam, r.Unit_Title || '',
        r.noData ? 'Veri Yok' : numFmt(r.Min),
        r.noData ? '' : (r.MinDate || ''),
        r.noData ? 'Veri Yok' : numFmt(r.Max),
        r.noData ? '' : (r.MaxDate || ''),
        r.noData ? 'Veri Yok' : numFmt(r.Avg),
        r.noData ? '' : numFmt(r.Count),
        r.noData ? '' : numFmt(r.MustBeCount),
        r.noData ? '' : numFmt(r.Percent),
        r.noData ? '' : numFmt(r.Std),
        r.noData ? '' : numFmt(r.Total),
        r.periyot || '', r.startDate || '', r.endDate || ''
    ]);

    const valid = havaAllData.filter(r => !r.noData);
    const aggRow = [
        'ÖZET', '', '', '', '',
        valid.length ? parseFloat(Math.min(...valid.map(r => parseFloat(r.Min) || 0)).toFixed(2)) : '',
        '',
        valid.length ? parseFloat(Math.max(...valid.map(r => parseFloat(r.Max) || 0)).toFixed(2)) : '',
        '',
        avg(valid.map(r => parseFloat(r.Avg) || 0)),
        valid.reduce((s, r) => s + (parseInt(r.Count) || 0), 0), '',
        avg(valid.map(r => parseFloat(r.Percent) || 0)),
        '', '', '', '', ''
    ];

    const ws1 = XLSX.utils.aoa_to_sheet([h1, ...rows1, aggRow]);
    ws1['!cols'] = [20, 18, 30, 12, 8, 10, 18, 10, 18, 10, 10, 14, 8, 10, 10, 10, 18, 18].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Ham Veri');

    // ── Sayfa 2: Şehir Ortalamaları ─────────────────────────────────────────
    const cityMap = {};
    for (const r of havaAllData) {
        if (r.noData) continue;
        const key = (r.grup || '') + '|||' + (r.sehir || '');
        if (!cityMap[key]) cityMap[key] = { grup: r.grup || '', sehir: r.sehir || '', mins: [], maxes: [], avgs: [], percents: [] };
        if (r.Min != null) cityMap[key].mins.push(parseFloat(r.Min) || 0);
        if (r.Max != null) cityMap[key].maxes.push(parseFloat(r.Max) || 0);
        if (r.Avg != null) cityMap[key].avgs.push(parseFloat(r.Avg) || 0);
        if (r.Percent != null) cityMap[key].percents.push(parseFloat(r.Percent) || 0);
    }

    const h2 = ['İstasyon Grubu', 'Şehir', 'İstasyon Sayısı', 'Ort. Min', 'Ort. Max', `Ort. ${activeParam} Değeri`, 'Ort. Veri %'];

    const cityRows = Object.values(cityMap)
        .sort((a, b) => (a.grup + a.sehir).localeCompare(b.grup + b.sehir, 'tr'))
        .map(c => [c.grup, c.sehir, c.avgs.length, avg(c.mins), avg(c.maxes), avg(c.avgs), avg(c.percents)]);

    const allCities = Object.values(cityMap);
    const cityAgg = [
        'GENEL ÖZET', '',
        allCities.reduce((s, c) => s + c.avgs.length, 0),
        avg(allCities.flatMap(c => c.mins)),
        avg(allCities.flatMap(c => c.maxes)),
        avg(allCities.flatMap(c => c.avgs)),
        avg(allCities.flatMap(c => c.percents))
    ];

    const ws2 = XLSX.utils.aoa_to_sheet([h2, ...cityRows, cityAgg]);
    ws2['!cols'] = [20, 18, 14, 10, 10, 14, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, 'Şehir Ortalamaları');

    const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
    // Parametre adını dosya adı için güvenli hale getir: "PM10 + SO2" → "PM10-SO2"
    const paramSlug = activeParam.replace(/\s*\+\s*/g, '-').replace(/[^\w-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    XLSX.writeFile(wb, `hava_kalitesi_${paramSlug}_${dateStr}.xlsx`);
}

// ── Tüm event listener'lar ve başlangıç yüklemesi ───────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Tab butonları
    document.getElementById('havaTabCityBtn')   ?.addEventListener('click', () => havaShowDataTab('city'));
    document.getElementById('havaTabStationBtn')?.addEventListener('click', () => havaShowDataTab('station'));

    // Tarih aralığı preset değişimi
    document.getElementById('havaRangePreset').addEventListener('change', function () {
        document.getElementById('havaCustomDates').style.display = this.value === 'custom' ? 'flex' : 'none';
    });

    // Analizi Başlat
    document.getElementById('havaStartBtn').addEventListener('click', async () => {
        if (havaIsRunning) return;

        const period = (document.querySelector('input[name="havaPeriod"]:checked') || {}).value || '8';
        const paramNames = havaGetSelectedParams();
        const paramName = paramNames.join(' + '); // görüntüleme ve meta için
        const preset = document.getElementById('havaRangePreset').value;

        let startDate, endDate;
        if (preset === 'custom') {
            startDate = (document.getElementById('havaStartDate').value || '').trim();
            endDate = (document.getElementById('havaEndDate').value || '').trim();
            if (!startDate || !endDate) { alert('Lütfen başlangıç ve bitiş tarihlerini girin.'); return; }
        } else {
            const range = havaGetDateRange(parseInt(preset));
            startDate = range.start;
            endDate = range.end;
        }

        havaIsRunning = true;
        havaIsPaused = false;
        havaAllData = [];
        havaCurrentStartDate = startDate;
        havaCurrentEndDate = endDate;
        havaCurrentParamName = paramName;
        havaCurrentParamNames = paramNames;
        havaCurrentPeriod = period;
        havaLastCompletedIndex = 0;
        havaResumingSessionId = null;
        havaStopRequested = false;

        // UI güncelle
        document.getElementById('havaProgress').style.display = 'block';
        document.querySelector('.hava-progress-bar-wrap').style.display = '';
        document.getElementById('havaProgressText').style.display = '';
        document.getElementById('havaStartBtn').style.display = 'none';
        document.getElementById('havaPauseBtn').style.display = 'inline-flex';
        document.getElementById('havaResumeBtn').style.display = 'none';
        document.getElementById('havaStopBtn').style.display = 'inline-flex';
        document.getElementById('havaSavedSection').style.display = 'none';
        document.getElementById('havaLogBox').innerHTML = '';

        havaLog('Analiz başlatılıyor...');
        havaLog(`Parametre: ${paramName} | Periyot: ${period === '8' ? 'Saatlik' : 'Günlük'} | ${startDate} — ${endDate}`);

        try {
            // 1. Siteyi arka planda aç
            const tab = await new Promise(resolve =>
                chrome.tabs.create({ url: 'https://sim.csb.gov.tr/STN/STN_Report/StationDataDownloadNew', active: false }, resolve)
            );
            havaScraperTabId = tab.id;
            chrome.tabs.update(tab.id, { autoDiscardable: false }); // Chrome'un sekmeyi uyutmasını engelle
            _havaInstallNavGuard();
            _havaStartTabPing(tab.id); // Dashboard'dan saniyede bir ping → freeze önleme

            // 2. Sayfa yüklenene kadar bekle (status=complete)
            await new Promise((resolve, reject) => {
                const giveUpTimer = setTimeout(() => reject(new Error('Sayfa yüklenemedi (60sn)')), 60000);
                const listener = (tabId, info) => {
                    if (tabId === havaScraperTabId && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        clearTimeout(giveUpTimer);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });

            havaLog('Sayfa yüklendi, Kendo widget\'ları başlatılıyor...');
            await havaSleep(4000); // Kendo init için

            // 3a. Bridge'i önce ISOLATED world'e inject et
            //     (chrome.runtime ↔ window.postMessage köprüsü)
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: havaScraperTabId },
                    files: ['hava_bridge.js']
                    // world varsayılan: ISOLATED
                });
            } catch (e) {
                throw new Error('Bridge inject hatası: ' + e.message);
            }

            // 3b. Scraper scriptini MAIN world'e inject et
            //     (window.$ / Kendo erişimi burada)
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: havaScraperTabId },
                    files: ['hava_content.js'],
                    world: 'MAIN'
                });
            } catch (e) {
                throw new Error('Content inject hatası: ' + e.message);
            }

            havaLog('Script yüklendi, istasyon listesi alınıyor...');

            // 4. İstasyon listesini MAIN world'de inline executeScript ile al
            const stationsData = await (async () => {
                for (let attempt = 0; attempt < 25; attempt++) {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: havaScraperTabId },
                        world: 'MAIN',
                        func: () => {
                            const $ = window.$;
                            if (!$) return { error: 'jQuery yok' };

                            let cityWidget = $('[id^="CityId"]').data('kendoMultiSelect');
                            if (!cityWidget) {
                                $('[data-role="multiselect"]').each(function () {
                                    const w = $(this).data('kendoMultiSelect');
                                    if (w && w.dataSource && w.dataSource.data().length > 50) {
                                        cityWidget = w; return false;
                                    }
                                });
                            }

                            let stationWidget = $('[id^="StationIds"]').data('kendoDropDownList');
                            if (!stationWidget) {
                                $('[data-role="dropdownlist"]').each(function () {
                                    const w = $(this).data('kendoDropDownList');
                                    if (w && w.dataSource && w.dataSource.data().length > 40) {
                                        stationWidget = w; return false;
                                    }
                                });
                            }

                            if (!cityWidget || !cityWidget.dataSource.data().length) return null;
                            if (!stationWidget) return { error: `Station widget yok. DDL sayısı: ${$('[data-role="dropdownlist"]').length}` };

                            return {
                                cities: cityWidget.dataSource.data().toJSON(),
                                stations: stationWidget.dataSource.data().toJSON()
                            };
                        }
                    });

                    const result = results && results[0] && results[0].result;
                    if (!result) {
                        await havaSleep(1000);
                        continue;
                    }
                    if (result.error) throw new Error('Widget hatası: ' + result.error);
                    return result;
                }
                throw new Error('Kendo widget\'ları 25 saniyede yüklenemedi');
            })();

            havaLog(`${stationsData.cities.length} şehir, ${stationsData.stations.length} istasyon bulundu.`);
            havaCurrentCities = stationsData.cities;
            havaCurrentStations = stationsData.stations;

            // 5. Progress dinleyici kur (background köprüsü üzerinden gelir)
            // Aynı mesaj hem doğrudan runtime hem relay üzerinden gelebileceğinden dedup Set kullanılır
            const _havaSeenProgress = new Set();
            havaProgressListener = (msg) => {
                if (msg.type === 'HAVA_RETRY_START') {
                    havaLog(`🔄 ${msg.count} NaN istasyon yeniden sorgulanıyor...`);
                    havaUpdateProgress(0, msg.count, 'Retry', '', '');
                }
                if (msg.type === 'HAVA_PROGRESS') {
                    // Retry mesajları için ayrı dedup anahtarı ('r:N'), aksi halde ana tur ile çakışır
                    const _deupKey = msg.retry ? ('r:' + msg.current) : msg.current;
                    if (_havaSeenProgress.has(_deupKey)) return;
                    _havaSeenProgress.add(_deupKey);
                    if (msg.data && !msg.error) {
                        if (msg.retry) {
                            // Retry: mevcut satırları güncelle (push değil replace)
                            const newRows = Array.isArray(msg.data) ? msg.data : [msg.data];
                            for (const nr of newRows) {
                                const idx = havaAllData.findIndex(r =>
                                    r.istasyon === nr.istasyon &&
                                    r.sehir    === nr.sehir    &&
                                    r.grup     === nr.grup     &&
                                    (r.ParameterText || r.paramName) === (nr.ParameterText || nr.paramName)
                                );
                                if (idx >= 0) havaAllData[idx] = nr;
                                else havaAllData.push(nr);
                            }
                        } else {
                            Array.isArray(msg.data) ? havaAllData.push(...msg.data) : havaAllData.push(msg.data);
                        }
                        havaUpdateLiveTables();
                    }
                    if (!msg.retry) havaLastCompletedIndex = msg.current;
                    havaUpdateProgress(msg.current, msg.total, msg.grupName, msg.sehirName, msg.istasyonName);
                    const _retryGotData = msg.retry && Array.isArray(msg.data) ? msg.data.some(d => !d.noData) : (msg.retry && msg.data && !msg.data.noData);
                    if (msg.error) {
                        havaLog(`⚠️ ${msg.retry ? '[Retry] ' : ''}${msg.sehirName} › ${msg.istasyonName} — ${msg.error}`);
                    } else if (msg.retry) {
                        havaLog(`🔄 Retry ${msg.current}/${msg.total}: ${msg.sehirName} › ${msg.istasyonName} — ${_retryGotData ? '✓ veri geldi' : 'hâlâ NaN'}`);
                    } else {
                        havaLog(`✓ ${msg.grupName} › ${msg.sehirName} › ${msg.istasyonName} (${msg.current}/${msg.total})`);
                    }
                }
                if (msg.type === 'HAVA_ERROR') {
                    havaLog(`❌ Hata: ${msg.error}`);
                }
                if (msg.type === 'HAVA_PAUSED') {
                    havaIsPaused = true;
                    document.getElementById('havaPauseBtn').style.display = 'none';
                    document.getElementById('havaResumeBtn').style.display = 'inline-flex';
                    document.getElementById('havaProgressText').textContent += '  — ⏸ Duraklatıldı';
                    havaLog('⏸ Analiz duraklatıldı. Devam etmek için "▶ Devam Et" butonuna basın.');
                    // Duraklatınca o ana kadar çekilen verinin özetini göster
                    const pauseMeta = {
                        lastDate: new Date().toLocaleString('tr-TR'),
                        startDate: havaCurrentStartDate,
                        endDate: havaCurrentEndDate,
                        count: havaAllData.length,
                        partial: true,
                        paramName: havaCurrentParamName
                    };
                    havaShowSavedSection(pauseMeta);
                }
                if (msg.type === 'HAVA_RESUMED') {
                    havaIsPaused = false;
                    document.getElementById('havaPauseBtn').style.display = 'inline-flex';
                    document.getElementById('havaResumeBtn').style.display = 'none';
                    havaLog('▶ Analiz devam ediyor...');
                }
                if (msg.type === 'HAVA_DONE') {
                    if (havaProgressListener) chrome.runtime.onMessage.removeListener(havaProgressListener);
                    havaProgressListener = null;
                    if (!havaStopRequested) {
                        havaFinish(startDate, endDate);
                    } else {
                        if (havaScraperTabId) { chrome.tabs.remove(havaScraperTabId); havaScraperTabId = null; }
                        havaResetUI();
                    }
                }
            };
            chrome.runtime.onMessage.addListener(havaProgressListener);

            // 6. Scraping'i başlat
            chrome.tabs.sendMessage(havaScraperTabId, {
                type: 'START_SCRAPING',
                config: { period, startDate, endDate, paramNames, paramName, cities: stationsData.cities, stations: stationsData.stations }
            }).catch(() => {});

        } catch (err) {
            havaLog('❌ ' + err.message);
            havaResetUI();
        }
    });

    // Duraklat
    document.getElementById('havaPauseBtn').addEventListener('click', () => {
        if (!havaScraperTabId || havaIsPaused) return;
        chrome.tabs.sendMessage(havaScraperTabId, { type: 'PAUSE_SCRAPING' }).catch(() => {});
        havaLog('⏸ Duraklama isteği gönderildi, mevcut istasyon bitince duraklar...');
        document.getElementById('havaPauseBtn').disabled = true;
        document.getElementById('havaPauseBtn').textContent = '⏳ Duraksıyor...';
    });

    // Devam Et
    document.getElementById('havaResumeBtn').addEventListener('click', () => {
        if (!havaScraperTabId || !havaIsPaused) return;
        chrome.tabs.sendMessage(havaScraperTabId, { type: 'RESUME_SCRAPING' }).catch(() => {});
        document.getElementById('havaPauseBtn').disabled = false;
        document.getElementById('havaPauseBtn').textContent = '⏸ Duraklat';
    });

    // Durdur
    document.getElementById('havaStopBtn').addEventListener('click', () => {
        if (!havaScraperTabId) return;

        const stopBtn = document.getElementById('havaStopBtn');
        stopBtn.disabled = true;
        stopBtn.textContent = '⏳ Durduruluyor...';

        chrome.tabs.sendMessage(havaScraperTabId, { type: 'STOP_SCRAPING' }).catch(() => {});
        havaLog('⏹ Durdurma isteği gönderildi, mevcut istasyon bitince duracak...');
        havaStopRequested = true;

        if (havaAllData.length > 0) {
            if (havaResumingSessionId) {
                // Devam eden bir analiz durduruldu — mevcut oturumu güncelle
                const resumeSession = havaAllSessions.find(s => s.id === havaResumingSessionId);
                if (resumeSession) {
                    resumeSession.data = [...havaAllData];
                    resumeSession.meta.count = havaAllData.length;
                    resumeSession.meta.lastDate = new Date().toLocaleString('tr-TR');
                    resumeSession.meta.lastCompletedIndex = havaLastCompletedIndex;
                    // scrapingConfig korunuyor — tekrar "Devam Et" mümkün olsun
                }
                const resumeId = havaResumingSessionId;
                havaActiveSessionId = resumeId;
                havaSaveAllSessions(() => {
                    havaLog(`💾 ${havaAllData.length} kayıt güncellendi (kısmi — tekrar devam edilebilir).`);
                    document.getElementById('havaSavedSection').style.display = 'block';
                    havaRenderSessionTabs();
                    const active = havaAllSessions.find(s => s.id === resumeId);
                    if (active) havaShowSavedSection(active.meta);
                });
            } else {
                // Yeni analiz durduruldu — scrapingConfig ile birlikte kaydet
                const sessionId = 'hava_' + Date.now();
                const meta = {
                    lastDate: new Date().toLocaleString('tr-TR'),
                    startDate: havaCurrentStartDate || '-',
                    endDate: havaCurrentEndDate || '-',
                    count: havaAllData.length,
                    partial: true,
                    paramName: havaCurrentParamName,
                    lastCompletedIndex: havaLastCompletedIndex,
                    scrapingConfig: {
                        period: havaCurrentPeriod,
                        startDate: havaCurrentStartDate,
                        endDate: havaCurrentEndDate,
                        paramNames: havaCurrentParamNames,
                        paramName: havaCurrentParamName,
                        cities: havaCurrentCities,
                        stations: havaCurrentStations
                    }
                };
                havaAllSessions.push({ id: sessionId, name: havaFormatSessionName(true), meta, data: [...havaAllData] });
                havaActiveSessionId = sessionId;
                havaSaveAllSessions(() => {
                    havaLog(`💾 ${havaAllData.length} kayıt kaydedildi (kısmi).`);
                    document.getElementById('havaSavedSection').style.display = 'block';
                    havaRenderSessionTabs();
                    havaShowSavedSection(meta);
                });
            }
        }
    });

    // Excel İndir
    document.getElementById('havaDownloadBtn').addEventListener('click', havaDownloadExcel);

    // Oturum Sil
    document.getElementById('havaDeleteSessionBtn').addEventListener('click', () => {
        if (!havaActiveSessionId) return;
        if (confirm('Bu oturum silinecek. Emin misiniz?')) {
            havaDeleteSession(havaActiveSessionId);
        }
    });

    // Tümünü Sil
    document.getElementById('havaDeleteAllBtn').addEventListener('click', () => {
        if (confirm('Tüm hava kalitesi oturumları silinecek. Emin misiniz?')) {
            havaAllSessions = [];
            havaActiveSessionId = null;
            havaAllData = [];
            chrome.storage.local.remove(['havaKalitesiSessions', 'havaKalitesiData', 'havaKalitesiMeta'], () => {
                document.getElementById('havaSavedSection').style.display = 'none';
                havaLog('🗑️ Tüm oturumlar temizlendi.');
            });
        }
    });

    // Parametre checkbox'larını dinle — başlığı anlık güncelle
    document.querySelectorAll('.hava-param-check').forEach(cb => {
        cb.addEventListener('change', () => havaUpdateMainTitle(havaGetSelectedParams().join(' + ')));
    });
    havaUpdateMainTitle(havaGetSelectedParams().join(' + '));

    // Başlangıçta kayıtlı veriyi yükle
    havaLoadAllSessions();
});
