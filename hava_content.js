// hava_content.js — sim.csb.gov.tr Kendo UI içerik scripti
// dashboard.js tarafından chrome.scripting.executeScript ile inject edilir.

(function () {
    'use strict';

    // Çift enjeksiyon koruması
    if (window._havaScraperInitialized) return;
    window._havaScraperInitialized = true;

    // ── Chrome throttling + AJAX iptal + sekme donma önlemleri ──────────────
    // 1. Web Lock: Chrome bu sekmeyi "aktif" sayar → timer'lar yavaşlamaz.
    //    exclusive + 4dk'da yenileme: Chrome bazen uzun süre tutulan 'shared' lock'ı
    //    "stale" sayıp bypass ediyor. Exclusive mod + periyodik yenileme bunu önler.
    (async function keepLockAlive() {
        while (true) {
            try {
                await navigator.locks.request('hava-scraper-lock', { mode: 'exclusive' }, () =>
                    new Promise(resolve => setTimeout(resolve, 240000)) // 4dk tut
                );
            } catch (_) {}
            // 4dk sonra otomatik bırakılır; hemen yeniden al
        }
    })();

    // 2. Screen Wake Lock: tarayıcının sekmeyi uyutmasını engeller
    (async () => {
        try {
            if (navigator.wakeLock) {
                let wl = await navigator.wakeLock.request('screen');
                // Visibility değişince yeniden al
                document.addEventListener('visibilitychange', async () => {
                    if (wl.released) {
                        try { wl = await navigator.wakeLock.request('screen'); } catch (_) {}
                    }
                });
            }
        } catch (_) {}
    })();

    // 3. visibilitychange maskeleme: site kendi AJAX'ını iptal etmesin
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    Object.defineProperty(document, 'hidden',          { get: () => false });
    document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);

    // 4. freeze event: site kodunun visibility değişimine tepki vermesini engelle.
    //    Not: bu Chrome'un sekmeyi freeze etme KARARINI durdurmaz (o browser seviyesinde
    //    alınır); sadece diğer JS listener'ların olayı duymasını engeller.
    //    Asıl freeze koruması Web Lock (yukarıda) ve autoDiscardable (dashboard) üzerinden sağlanır.
    document.addEventListener('freeze', e => e.stopImmediatePropagation(), true);

    const STATION_GROUPS = [
        { Id: '5', Name: 'Akdeniz THM' },
        { Id: '7', Name: 'Doğu Anadolu THM' },
        { Id: '4', Name: 'Ege THM' },
        { Id: '1', Name: 'Güney Doğu Anadolu THM' },
        { Id: '8', Name: 'Güney İç Anadolu THM' },
        { Id: '3', Name: 'Kuzey İç Anadolu THM' },
        { Id: '6', Name: 'Marmara THM' },
        { Id: '2', Name: 'Orta Karadeniz THM' },
        { Id: '0', Name: 'Diğer' },
    ];

    let stopRequested  = false;
    let pauseRequested = false;

    /** Şehir/grup önbelleği — aynı şehirdeki ardışık istasyonlarda clearForm + AJAX atlanır */
    let _lastCityId  = null;
    let _lastGroupId = null;

    // Parametre widget önbelleği — her istasyonda widget referansını bulmaktan kaçınır
    let cachedParamWidget = null;

    /** Duraklat bayrağı varsa devam edilene kadar bekler */
    async function waitIfPaused() {
        if (!pauseRequested) return;
        send({ type: 'HAVA_PAUSED' });
        while (pauseRequested && !stopRequested) {
            await sleep(500);
        }
        if (!stopRequested) send({ type: 'HAVA_RESUMED' });
    }

    // ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────

    // MessageChannel tabanlı tick — Chrome arka plan throttling'inden etkilenmez.
    // Chrome, setTimeout/setInterval'a min 1sn kısıtlaması koyar ama
    // MessageChannel.port.onmessage'ı throttle etmez (React Scheduler da bunu kullanır)
    const _mc = (() => {
        const ch = new MessageChannel();
        const cbs = [];
        ch.port1.onmessage = () => { const fn = cbs.shift(); if (fn) fn(); };
        return { tick: () => new Promise(r => { cbs.push(r); ch.port2.postMessage(null); }) };
    })();

    // ── window.setTimeout patch ───────────────────────────────────────────────
    // Kendo UI, AJAX sonrası veri işleme ve widget güncellemeleri için kısa
    // setTimeout'lar kullanır (örn. setTimeout(fn,0), setTimeout(fn,100)).
    // Chrome bunları arka planda 1 sn'ye şişirir. Bu patch, ≤1000ms gecikmeli
    // tüm setTimeout çağrılarını MessageChannel'a yönlendirerek Kendo'yu da
    // throttle'dan kurtarır. >1000ms gecikmeler native'e devredilir.
    (function patchSetTimeout() {
        const _native   = window.setTimeout.bind(window);
        const _nativeCl = window.clearTimeout.bind(window);

        const ch2    = new MessageChannel();
        const timers = new Map();
        let   nextId = 1_000_000; // Yüksek ID — native ID'lerle çakışmaz

        ch2.port1.onmessage = ({ data: id }) => {
            const t = timers.get(id);
            if (!t) return;
            if (Date.now() >= t.deadline) {
                timers.delete(id);
                t.cb();
            } else {
                ch2.port2.postMessage(id); // Deadline gelmediyse bir sonraki tick'e ertele
            }
        };

        window.setTimeout = function (fn, delay, ...args) {
            if (typeof delay !== 'number' || delay > 1000) {
                return _native(fn, delay, ...args); // Uzun gecikmeler native'e
            }
            const id = nextId++;
            const cb = typeof fn === 'function' ? () => fn(...args) : () => { try { eval(fn); } catch(_) {} };
            timers.set(id, { deadline: Date.now() + (delay || 0), cb });
            ch2.port2.postMessage(id);
            return id;
        };

        window.clearTimeout = function (id) {
            if (timers.has(id)) timers.delete(id);
            else _nativeCl(id);
        };
    })();

    // sleep: gerçek duvar saati zamanına göre bekler, throttle'dan etkilenmez
    const sleep = async (ms) => {
        const end = Date.now() + ms;
        do { await _mc.tick(); } while (Date.now() < end);
    };
    const randomSleep = () => sleep(150 + Math.random() * 200); // 250ms ort. — setTimeout patch ile tampon gereksinimi azaldı

    function send(msg) {
        // MAIN world'de chrome.runtime yok — hava_bridge.js (isolated) köprüsüne postMessage ile iletiyoruz
        try { window.postMessage({ __havaFromMain: true, payload: msg }, '*'); } catch (_) {}
    }

    function getCityWidget() {
        const $ = window.$;
        let w = $('[id^="CityId"]').data('kendoMultiSelect');
        if (w) return w;
        const allMulti = $('[data-role="multiselect"]');
        for (let i = 0; i < allMulti.length; i++) {
            const temp = $(allMulti[i]).data('kendoMultiSelect');
            if (temp && temp.dataSource && temp.dataSource.data().length > 50) return temp;
        }
        return null;
    }

    function getStationWidget() {
        const $ = window.$;
        let w = $('[id^="StationIds"]').data('kendoDropDownList');
        if (w) return w;
        const allDdl = $('[data-role="dropdownlist"]');
        for (let i = 0; i < allDdl.length; i++) {
            const temp = $(allDdl[i]).data('kendoDropDownList');
            if (temp && temp.dataSource && temp.dataSource.data().length > 40) return temp;
        }
        return null;
    }

    /**
     * Kendo yükleme maskesini iki fazda bekler (MessageChannel — throttle'dan etkilenmez):
     *  Faz 1 — Mask GÖRÜNENE kadar bekle (max appearMs ms gerçek süre)
     *  Faz 2 — Mask KAYBOLANA kadar bekle (max timeout ms gerçek süre)
     * Mask hiç gelmezse appearMs sonra resolve eder.
     */
    async function waitForLoading(timeout = 35000, appearMs = 1500) {
        const start = Date.now();

        // Faz 1: mask belirene kadar bekle
        while (!stopRequested) {
            if (document.querySelector('.k-loading-mask')) break;
            if (Date.now() - start > appearMs) return; // mask gelmedi
            await _mc.tick();
        }
        if (stopRequested) return;

        // Faz 2: mask kaybolana kadar bekle
        while (!stopRequested) {
            if (!document.querySelector('.k-loading-mask')) break;
            if (Date.now() - start > timeout) break;
            await _mc.tick();
        }
    }

    /** İstasyon listesini Kendo datasource'lardan çeker */
    async function loadStations() {
        const $ = window.$;
        if (!$) { send({ type: 'HAVA_ERROR', error: 'jQuery bulunamadı.' }); return; }

        // Kendo widget'ları yüklenene kadar bekle (max 15 sn)
        let tries = 15;
        while (tries-- > 0) {
            const cw = getCityWidget();
            if (cw && cw.dataSource.data().length > 0) break;
            await sleep(1000);
        }

        try {
            const cityWidget = getCityWidget();
            const stationWidget = getStationWidget();

            if (!cityWidget || !stationWidget) {
                // Fallback: widget ID'leri değişmiş olabilir — role ile bul
                const allMulti = $('[data-role="multiselect"]');
                const allDDL = $('[data-role="dropdownlist"]');
                send({ type: 'HAVA_ERROR', error: `Kendo widget'ları bulunamadı. MultiSelect sayısı: ${allMulti.length}, DDL: ${allDDL.length}` });
                return;
            }

            const cities = cityWidget.dataSource.data().toJSON();
            const stations = stationWidget.dataSource.data().toJSON();
            send({ type: 'HAVA_STATIONS_LOADED', cities, stations });
        } catch (err) {
            send({ type: 'HAVA_ERROR', error: 'loadStations: ' + err.message });
        }
    }

    /** Formu sıfırlar — Kendo'nun reload'unu bekler (Sorun 4 düzeltmesi) */
    async function clearForm() {
        const clearBtn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="reset"]'))
            .find(el => (el.textContent || el.value || '').trim().includes('Temizle'));
        if (clearBtn) {
            clearBtn.click();
            await sleep(120);
            await waitForLoading(10000); // Kendo arka planda AJAX reload yapabilir — bitmesini bekle
        }
        // clearForm sonrası param widget önbelleğini sıfırla (form yenilendi)
        cachedParamWidget = null;
    }

    /** Tek bir istasyon için sorgu çalıştırır; seçili her parametre için bir satır döner (array). */
    async function queryStation({ stationId, stationName, cityId, cityName, groupId, groupName, period, startDate, endDate, paramNames }) {
        const $ = window.$;
        const targetParams = (Array.isArray(paramNames) ? paramNames : [paramNames || 'PM10']).map(p => p.toUpperCase());

        // Aynı şehir/grup ise clearForm + şehir AJAX'nı atla (büyük hız kazanımı)
        const isSameContext = (cityId === _lastCityId && groupId === _lastGroupId);

        try {
            if (!isSameContext) {
                // ── TAM AKIŞ: şehir/grup değişti → formu sıfırla + şehir AJAX'ı ──
                await clearForm();

                // 2. İstasyon Grubu radio
                const groupRadio = document.querySelector(`input[name="StationGroupId"][value="${groupId}"]`);
                if (groupRadio) {
                    groupRadio.checked = true;
                    groupRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    await sleep(100);
                }

                // 3. Şehir MultiSelect — değişince Kendo istasyon listesini AJAX ile yeniler
                const cw = getCityWidget();
                if (cw) {
                    cw.value([cityId]);
                    cw.trigger('change');
                    await waitForLoading(10000, 800);
                }

                _lastCityId  = cityId;
                _lastGroupId = groupId;
            }
            // else: HİZLI AKIŞ — aynı şehir/grup, clearForm + şehir AJAX atlandı

            // 4. İstasyon DropDownList (her zaman değiştir)
            const stationWidget = getStationWidget();
            if (stationWidget) {
                stationWidget.value(stationId);
                stationWidget.trigger('change');
                await waitForLoading(10000, 600); // İstasyon değişince Kendo o istasyona ait Parametreleri AJAX ile çeker, bekle!
                await sleep(150);
            }

            // 5. Veri Periyodu radio
            // Bootstrap btn-group: önce tüm radio'ları temizle, sonra hedefi işaretle,
            // hem label.click() hem change event gönder
            const periodRadio = document.querySelector(`input[name="DataPeriods"][value="${period}"]`);
            if (periodRadio) {
                // Tüm period radio'larını sıfırla
                document.querySelectorAll('input[name="DataPeriods"]').forEach(r => { r.checked = false; });
                // Hedef radio'yu işaretle
                periodRadio.checked = true;
                // Bootstrap active class güncellemesi için label'a tıkla
                const periodLabel = periodRadio.closest('label') || periodRadio.parentElement;
                if (periodLabel) periodLabel.click();
                // Kendo/form için change event
                periodRadio.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(50);
            }

            // 6. Tarih aralığı — Kendo DateTimePicker
            const dtPickers = $('[data-role="datetimepicker"]');
            if (dtPickers.length >= 2) {
                const sp = $(dtPickers[0]).data('kendoDateTimePicker');
                const ep = $(dtPickers[1]).data('kendoDateTimePicker');
                const toDate = (str) => {
                    // "DD.MM.YYYY HH:MM" → Date
                    const [datePart, timePart] = str.split(' ');
                    const [d, m, y] = datePart.split('.');
                    const [hh, mm] = (timePart || '00:00').split(':');
                    return new Date(+y, +m - 1, +d, +hh, +mm);
                };
                if (sp) { sp.value(toDate(startDate)); sp.trigger('change'); }
                if (ep) { ep.value(toDate(endDate)); ep.trigger('change'); }
                await sleep(50);
            }

            // 7. Parametre seç — çoklu parametre desteği
            if (!cachedParamWidget) {
                // Sadece Parametre Widget referansını bir kere bul (performans için)
                for (let attempt = 0; attempt < 8 && !cachedParamWidget; attempt++) {
                    $('[data-role="multiselect"]').each(function () {
                        const w = $(this).data('kendoMultiSelect');
                        if (!w || cachedParamWidget) return;
                        
                        const items = w.dataSource.data().toJSON();
                        const isParamWidget = items.some(i => {
                            const txt = (i.Name || i.Text || i.Label || i.ParameterName || i.Value || i.value || '').toUpperCase();
                            return txt.includes('PM10') || txt.includes('SO2') || txt.includes('O3') || txt.includes('NO2') || txt.includes('PARTİKÜL');
                        });
                        
                        if (isParamWidget) cachedParamWidget = w;
                    });
                    if (!cachedParamWidget) await sleep(250);
                }
            }

            // Widget bulunduysa, o anki İSTASYONUN parametre listesinden ID'leri bul ve seç
            if (cachedParamWidget) {
                let currentParamVals = [];
                // Kendo ajax ile listeyi yenilemiş olabilir, bazen boş gelir sonradan dolar, o yüzden döngüyle bekliyoruz
                for (let attempt = 0; attempt < 10; attempt++) {
                    const items = cachedParamWidget.dataSource.data().toJSON();
                    for (const tp of targetParams) {
                        const found = items.find(i => {
                            const txt = (i.Name || i.Text || i.Label || i.ParameterName || i.Value || i.value || '').toUpperCase();
                            const normalizedTxt = txt.replace(/PM\s*2[,.]5/g, 'PM2.5');
                            const tokens = normalizedTxt.split(/[\s()]+/);
                            return tokens.includes(tp) || normalizedTxt === tp;
                        });
                        if (found) {
                            const val = found.Value || found.value || found.Id || found.id || found.ParameterId || tp;
                            if (!currentParamVals.includes(val)) currentParamVals.push(val);
                        }
                    }
                    if (currentParamVals.length > 0) break;
                    await sleep(200);
                }

                if (currentParamVals.length > 0) {
                    for (let attempt = 0; attempt < 5; attempt++) {
                        cachedParamWidget.value(currentParamVals);
                        cachedParamWidget.trigger('change');
                        await sleep(150);
                        const selected = cachedParamWidget.value();
                        if (selected && selected.length > 0) break;
                    }
                }
            }
            // Ek bekleme: form durumunun güncellenmesi için
            await sleep(150);

            // 8. Sorgula butonuna tıkla (enabled olana kadar bekle)
            let sorgulaBtn = null;
            for (let i = 0; i < 12; i++) {
                sorgulaBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .find(el => {
                        const txt = (el.textContent || el.value || '').trim();
                        return txt.includes('Sorgula') && !el.disabled && !el.classList.contains('k-state-disabled');
                    });
                if (sorgulaBtn) break;
                await sleep(150);
            }
            if (!sorgulaBtn) throw new Error('Sorgula butonu disabled veya bulunamadı');

            // 8b. Sorgula öncesi grid temizle + Kendo dataBound event köprüsü kur.
            // dataBound, loading mask'ten farklı olarak hiç kaçmaz: Kendo grid veriyi render
            // ettiğinde her zaman tetiklenir — sunucu hızlı da yanıtlasa yavaş da yanıtlasa.
            let _dataBoundFired = false;
            let _dataBoundResolve = null;
            const _dataBoundPromise = new Promise(r => { _dataBoundResolve = r; });
            const gridsNow = $('[data-role="grid"]');
            let _g2widget = null;
            if (gridsNow.length >= 2) {
                _g2widget = $(gridsNow[1]).data('kendoGrid');
                if (_g2widget) {
                    // Önce grid datasource'unu temizle (stale veri koruması)
                    try { _g2widget.dataSource.data([]); } catch (_) {}
                    // 150ms bekle: temizlemenin kendi dataBound'unu (setTimeout patch üzerinden
                    // < 1ms'de tetiklenir) geçmek için yeterli; yeni listener bu event'i yakalamaz.
                    await sleep(150);
                    _g2widget.one('dataBound', () => { _dataBoundFired = true; _dataBoundResolve(); });
                }
            }

            sorgulaBtn.click();

            // 9. Aşama A — Sorgula butonu re-enable: sunucu AJAX yanıtı döndü
            await sleep(150);
            const ajaxTimeout = Date.now() + 60000;
            while (!stopRequested && Date.now() < ajaxTimeout) {
                const isEnabled = Array.from(document.querySelectorAll('button, input[type="submit"]'))
                    .some(el => (el.textContent || el.value || '').trim().includes('Sorgula')
                              && !el.disabled
                              && !el.classList.contains('k-state-disabled'));
                if (isEnabled) break;
                await sleep(120);
            }

            // Aşama B — dataBound event (birincil, 2sn timeout) + grid polling (nihai arbiter)
            // dataBound: Kendo grid veriyi render etince tetiklenir → hızlı çıkış sağlar.
            // Tetiklenmezse (site custom AJAX kullanıyorsa) 2sn sonra doğrudan poll'a geçilir;
            // poll zaten veriyi 80ms aralıkla okur ve bulunca çıkar — hiçbir senaryo bloke olmaz.
            if (_g2widget && !_dataBoundFired) {
                await Promise.race([
                    _dataBoundPromise,
                    new Promise(resolve => { setTimeout(resolve, 5000); })
                ]);
            }
            await sleep(80); // minimal render tamponu

            // Grid referansını taze al — tüm durumlar için tek poll penceresi
            let summaries = null;
            const readDeadline = Date.now() + 7000;
            while (!stopRequested && Date.now() < readDeadline) {
                const freshGrids = $('[data-role="grid"]');
                if (freshGrids.length >= 2) {
                    const g2 = $(freshGrids[1]).data('kendoGrid');
                    if (g2) {
                        const rows = g2.dataSource.data();
                        // Tüm satırları al — her parametre için bir satır gelir.
                        if (rows && rows.length > 0) { summaries = rows.toJSON(); break; }
                    }
                }
                await sleep(80);
            }

            if (!summaries || summaries.length === 0) {
                // Veri yok — seçili her parametre için boş satır
                return targetParams.map(tp => buildRow(groupName, cityName, stationName, null, period, startDate, endDate, tp));
            }

            // Her grid satırı için buildRow çağır
            return summaries.map(s => buildRow(groupName, cityName, stationName, s, period, startDate, endDate, s.ParameterText || targetParams[0]));

        } catch (err) {
            // Hata durumunda şehir önbelleğini sıfırla — sonraki istasyon tam akış yapsın
            _lastCityId  = null;
            _lastGroupId = null;
            return targetParams.map(tp => ({
                grup: groupName, sehir: cityName, istasyon: stationName,
                noData: true, error: err.message,
                periyot: period === '8' ? 'Saatlik' : 'Günlük',
                startDate, endDate, paramName: tp
            }));
        }
    }

    function buildRow(grupName, sehirName, istasyonName, s, period, startDate, endDate, paramName) {
        if (!s) {
            return {
                grup: grupName,
                sehir: sehirName,
                istasyon: istasyonName,
                Station_Title: istasyonName,
                ParameterText: paramName || 'PM10',
                Unit_Title: 'NaN',
                Min: 'NaN', MinDate: 'NaN',
                Max: 'NaN', MaxDate: 'NaN',
                Avg: 'NaN', Count: 'NaN', MustBeCount: 'NaN',
                Percent: 'NaN', Std: 'NaN', Total: 'NaN',
                periyot: period === '8' ? 'Saatlik' : 'Günlük',
                startDate, endDate,
                noData: true
            };
        }
        return {
            grup: grupName,
            sehir: sehirName,
            istasyon: istasyonName,
            Station_Title: s.Station_Title || istasyonName,
            ParameterText: s.ParameterText || paramName || 'PM10',
            Unit_Title: s.Unit_Title || '',
            Min: s.Min,
            MinDate: s.MinDate || '',
            Max: s.Max,
            MaxDate: s.MaxDate || '',
            Avg: s.Avg,
            Count: s.Count,
            MustBeCount: s.MustBeCount,
            Percent: s.Percent,
            Std: s.Std,
            Total: s.Total,
            periyot: period === '8' ? 'Saatlik' : 'Günlük',
            startDate,
            endDate,
            noData: false
        };
    }

    /** Ana döngü */
    async function startScraping({ period, startDate, endDate, paramNames, paramName, cities, stations, startFromIndex = 0 }) {
        // Geriye dönük uyumluluk: eski oturumlar paramName (string) saklıyor
        const _paramNames = paramNames || (paramName ? [paramName] : ['PM10']);
        stopRequested  = false;
        cachedParamWidget = null;
        _lastCityId  = null; // Şehir önbelleğini sıfırla
        _lastGroupId = null;
        const _failedStations = []; // noData dönen istasyonlar — tarama sonunda yeniden denenir

        // cityId → city objesi haritası
        const cityMap = {};
        for (const c of cities) cityMap[c.Id] = c;

        // Gruplara göre organize et (alfabetik)
        const grouped = [];
        for (const group of STATION_GROUPS) {
            const gs = stations.filter(s => String(s.StationGroup) === String(group.Id));
            if (gs.length === 0) continue;

            const cityIds = [...new Set(gs.map(s => s.CityId))];
            const sortedCities = cityIds
                .map(id => cityMap[id])
                .filter(Boolean)
                .sort((a, b) => a.Name.localeCompare(b.Name, 'tr'));

            const stationsByCity = {};
            for (const city of sortedCities) {
                stationsByCity[city.Id] = gs
                    .filter(s => s.CityId === city.Id)
                    .sort((a, b) => (a.Name || '').localeCompare(b.Name || '', 'tr'));
            }

            grouped.push({ group, cities: sortedCities, stationsByCity });
        }

        // Toplam istasyon sayısı
        let total = 0;
        for (const g of grouped) {
            for (const c of g.cities) total += (g.stationsByCity[c.Id] || []).length;
        }

        let current = 0;

        for (const { group, cities: sortedCities, stationsByCity } of grouped) {
            if (stopRequested) break;

            for (const city of sortedCities) {
                if (stopRequested) break;

                for (const station of (stationsByCity[city.Id] || [])) {
                    if (stopRequested) break;
                    current++;
                    if (current <= startFromIndex) continue; // Devam Et: daha önce işlenmiş istasyonları atla

                    const _queryParams = {
                        stationId: station.id || station.Id,
                        stationName: station.Name || station.name || '',
                        cityId: city.Id,
                        cityName: city.Name,
                        groupId: group.Id,
                        groupName: group.Name,
                        period,
                        startDate,
                        endDate,
                        paramNames: _paramNames
                    };

                    const data = await queryStation(_queryParams);

                    // data artık array — hata varsa ilk hatalı satırdan al
                    const anyError = Array.isArray(data)
                        ? (data.find(d => d.error) || {}).error || null
                        : (data.error || null);

                    // Tüm satırlar noData dönmüşse retry listesine ekle
                    const allNoData = Array.isArray(data) ? data.every(d => d.noData) : (data && data.noData);
                    if (allNoData) {
                        _failedStations.push({
                            queryParams: _queryParams,
                            grupName: group.Name,
                            sehirName: city.Name,
                            istasyonName: station.Name || station.name || ''
                        });
                    }

                    send({
                        type: 'HAVA_PROGRESS',
                        data,
                        current,
                        total,
                        grupName: group.Name,
                        sehirName: city.Name,
                        istasyonName: station.Name || station.name || '',
                        error: anyError
                    });

                    await randomSleep();
                    await waitIfPaused();
                    if (stopRequested) break;
                }
            }
        }

        // ── Retry turu: noData dönen istasyonları yeniden sorgula ─────────────
        if (!stopRequested && _failedStations.length > 0) {
            send({ type: 'HAVA_RETRY_START', count: _failedStations.length });
            _lastCityId      = null;  // Şehir önbelleğini sıfırla — temiz akışla başla
            _lastGroupId     = null;
            cachedParamWidget = null;

            let retryNum = 0;
            for (const { queryParams, grupName, sehirName, istasyonName } of _failedStations) {
                if (stopRequested) break;
                retryNum++;

                const data = await queryStation(queryParams);
                const anyError = Array.isArray(data)
                    ? (data.find(d => d.error) || {}).error || null
                    : (data && data.error) || null;

                send({
                    type: 'HAVA_PROGRESS',
                    retry: true,
                    data,
                    current: retryNum,
                    total: _failedStations.length,
                    grupName,
                    sehirName,
                    istasyonName,
                    error: anyError
                });

                await randomSleep();
                await waitIfPaused();
            }
        }

        send({ type: 'HAVA_DONE', total: current });
    }

    // ── Mesaj dinleyici ───────────────────────────────────────────────────────
    // MAIN world'de chrome.runtime.onMessage yok.
    // hava_bridge.js (isolated world), chrome.runtime mesajlarını buraya window.postMessage ile iletir.
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || !event.data.__havaToMain) return;
        const msg = event.data.payload;
        if (msg.type === 'START_SCRAPING') {
            startScraping(msg.config);
        } else if (msg.type === 'STOP_SCRAPING') {
            pauseRequested = false;
            stopRequested = true;
        } else if (msg.type === 'PAUSE_SCRAPING') {
            pauseRequested = true;
        } else if (msg.type === 'RESUME_SCRAPING') {
            pauseRequested = false;
        }
    });

})();
