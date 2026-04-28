/**
 * Content.js — Orkestratör.
 *
 * Bu dosya modülleri bir araya getirir:
 *   ScraperFactory → Scrape → Validate → Currency → StorageManager
 *
 * Tüm iş mantığı modüllere devredilmiştir:
 *   - utils/dom-helpers.js      → DOM sorgulama
 *   - utils/storage-manager.js  → Chrome Storage CRUD
 *   - parsers/area-parser.js    → m² ayrıştırma
 *   - parsers/currency-parser.js→ Döviz dönüşümü
 *   - validators/listing-validator.js → Veri doğrulama
 *   - scrapers/base-scraper.js  → Temel kazıyıcı
 *   - scrapers/sahibinden-scraper.js → Sahibinden kazıyıcı
 *   - scrapers/scraper-factory.js → Fabrika deseni
 */

// ════════════════════════════════════════════
//  ANA FONKSİYON: scrapeListing
// ════════════════════════════════════════════

async function scrapeListing() {
    try {
        // 1. Siteyi tanı
        const scraper = ScraperFactory.detect();
        if (!scraper) return { success: false, message: 'Desteklenmeyen Site' };

        // 2. Veriyi çek
        const rawData = await scraper.scrape();
        if (rawData.success === false) return rawData;

        // 3. Doğrula (Guard Clause katmanı)
        const validation = ListingValidator.validate(rawData);
        if (!validation.isValid) {
            return { success: false, message: '❌ ' + validation.errors.join(', ') };
        }
        const data = validation.data;

        // 4. Döviz dönüşümü
        const currency = await CurrencyParser.getConversionData();

        const priceConv = CurrencyParser.convert(data.price, currency.rate);
        const aidatConv = CurrencyParser.convert(data.aidat, currency.rate);
        const unitPriceConv = CurrencyParser.convertDecimal(data.unitPrice, currency.rate);

        // 5. Projeyi belirle
        const rawProj = document.getElementById('projectSelect')?.value || 'Varsayılan';
        const currentProject = rawProj.trim() || 'Varsayılan';

        // 5.5 Doluluk Oranı
        const doluluk = document.getElementById('floatDoluluk')?.value || '';
        if (doluluk) chrome.storage.local.set({ lastOccupancyRate: doluluk });

        // 6. Kayıt objesi oluştur
        const newItem = {
            Baslik: data.title,
            Durum: data.durum,
            Fiyat: data.price,
            FiyatUSD: currency.targetCur === 'USD' ? priceConv : '',
            FiyatConverted: priceConv,
            Brut: data.brut,
            Net: data.net,
            Aidat: data.aidat === 0 ? '' : data.aidat,
            AidatUSD: currency.targetCur === 'USD' ? aidatConv : '',
            AidatConverted: aidatConv,
            BirimFiyat: data.unitPrice === 0 ? '' : data.unitPrice,
            BirimFiyatUSD: currency.targetCur === 'USD' ? unitPriceConv : '',
            BirimFiyatConverted: unitPriceConv,
            CurrencySymbol: currency.symbol,
            CurrencyCode: currency.targetCur,
            AidatM2: data.aidatM2 === 0 ? '' : data.aidatM2,
            Link: window.location.href,
            ImageUrl: data.imageUrl,
            Not: data.isTahmin ? 'Tahmini Brüt (Net x 1.2)' : '',
            officeName: data.officeName,
            agentName: data.agentName,
            phones: data.phones,
            Doluluk: doluluk,
            isSatilik: data.isSatilik,
            project: currentProject
        };

        // 7. Kaydet
        return await StorageManager.addListing(newItem);

    } catch (e) {
        console.error('[İlan Asistanı] Hata:', e);
        if (e.message && e.message.includes('context invalidated')) {
            return { success: false, message: '⚠️ Eklenti güncellendi. Lütfen sayfayı yenileyin (F5).' };
        }
        return { success: false, message: 'Hata: ' + e.message };
    }
}

// ════════════════════════════════════════════
//  UI ENJEKSİYONU
// ════════════════════════════════════════════

function injectUI() {
    const scraper = ScraperFactory.detect();
    if (!scraper) return;

    let targetContainer = scraper.getInjectTarget();
    const isFloating = !targetContainer;
    if (!targetContainer) targetContainer = document.body;

    // Guard: Tekrar enjeksiyon engelle
    if (document.getElementById('ilan-asistani-ui')) return;

    const div = document.createElement('div');
    div.id = 'ilan-asistani-ui';

    // ── Stil ──
    Object.assign(div.style, {
        marginTop: '10px', padding: '15px', background: '#f8f9fa',
        borderRadius: '8px', border: '1px solid #e9ecef', textAlign: 'center',
        boxSizing: 'border-box', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '999999'
    });

    if (isFloating) {
        Object.assign(div.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            width: '300px', maxHeight: '90vh', overflowY: 'auto'
        });
    } else {
        Object.assign(div.style, {
            width: '100%', marginBottom: '20px', position: 'relative'
        });
    }

    // ── HTML ──
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:5px;">
        <h4 style="margin:0; font-size:14px; color:#333;">İlan Asistanı</h4>
        ${isFloating ? '<button id="btnMinMax" style="background:none; border:none; cursor:pointer; font-size:16px;">_</button>' : ''}
      </div>
      <div id="uiContent">
          <button id="btnScrapeInfo" style="width:100%; margin-bottom:8px; padding:10px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:14px;">&#x1F50D; Veri &Ccedil;ek</button>
          <button id="btnOpenDash" style="width:100%; padding:8px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; font-size:13px;">&#x1F4CA; Paneli A&ccedil;</button>
          
          <!-- Proje Seçimi -->
          <div style="margin-top:10px; display:flex; gap:5px; align-items:center;">
            <select id="projectSelect" style="flex-grow:1; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:12px; width:0; min-width: 100px; background: white; cursor: pointer;">
                <option value="Varsayılan">Varsayılan</option>
            </select>
            <button id="btnNewProject" style="width:30px; padding:6px; background:#17a2b8; color:white; border:none; border-radius:4px; cursor:pointer;" title="Yeni Proje">+</button>
          </div>

          <!-- Hızlı Ekle Bölümü -->
          <div style="margin-top:10px; padding-top:10px; border-top:1px solid #eee;">
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" id="floatBrut" placeholder="Brüt m²" style="width:90px; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                <input type="text" id="floatDoluluk" placeholder="Doluluk %" title="Doluluk Oranı (%)" style="flex:1; min-width:0; padding:6px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
            </div>
            <input type="text" id="floatAidat" placeholder="Aidat (TL)" style="width:100%; padding:6px; margin-bottom:5px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
            <input type="text" id="floatKira" placeholder="Kira/Fiyat (TL)" style="width:100%; padding:6px; margin-bottom:5px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
            <button id="btnFloatAdd" style="width:100%; padding:8px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:13px;">➕ Ekle</button>
          </div>

          <div id="scrapeStatus" style="margin-top:8px; font-size:13px; font-weight:bold; min-height:20px;"></div>
      </div>
    `;

    // ── DOM'a ekle ──
    if (isFloating) {
        document.body.appendChild(div);
        setupMinimize();
    } else {
        targetContainer.appendChild(div);
    }

    // ── Event Listener'lar ──
    setupProjectLogic();
    setupScrapeButton();
    setupQuickAddButton(scraper);
    setupDashboardButton();
    loadLastOccupancy();
}

/** Son doluluk oranını yükle */
function loadLastOccupancy() {
    chrome.storage.local.get(['lastOccupancyRate'], (res) => {
        const input = document.getElementById('floatDoluluk');
        if (input && res.lastOccupancyRate) {
            input.value = res.lastOccupancyRate;
        }
    });
}

// ════════════════════════════════════════════
//  UI YARDIMCI FONKSİYONLAR (Ayrılmış)
// ════════════════════════════════════════════

/** Minimize/Maximize toggle */
function setupMinimize() {
    const btnMin = document.getElementById('btnMinMax');
    const content = document.getElementById('uiContent');
    if (!btnMin || !content) return;

    btnMin.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        btnMin.innerHTML = isHidden ? '_' : '□';
    });
}

/** Proje seçim/oluşturma mantığı */
function setupProjectLogic() {

    function loadProjects() {
        chrome.storage.local.get(['projectNames', 'activeProject'], (result) => {
            const list = result.projectNames || ['Varsayılan'];
            const active = result.activeProject || 'Varsayılan';

            const sel = document.getElementById('projectSelect');
            if (!sel) return;

            sel.innerHTML = '';
            list.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.innerText = p;
                if (p === active) opt.selected = true;
                sel.appendChild(opt);
            });
        });
    }
    loadProjects();

    // Proje değişikliği
    const projSelect = document.getElementById('projectSelect');
    if (projSelect) {
        projSelect.addEventListener('change', () => {
            const val = projSelect.value.trim() || 'Varsayılan';
            chrome.storage.local.set({ activeProject: val });
        });
    }

    // Yeni proje butonu
    const btnNewProj = document.getElementById('btnNewProject');
    if (btnNewProj) {
        btnNewProj.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = prompt('Yeni Proje Adı:');
            if (!name || !name.trim()) return;
            const trimmedName = name.trim();

            chrome.storage.local.get(['projectNames'], (res) => {
                const list = res.projectNames || ['Varsayılan'];
                if (!list.includes(trimmedName)) {
                    list.push(trimmedName);
                    chrome.storage.local.set({ projectNames: list, activeProject: trimmedName }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('[İlan Asistanı] Proje kayıt hatası:', chrome.runtime.lastError);
                            return;
                        }
                        loadProjects();
                    });
                } else {
                    alert('Bu isimde proje zaten var!');
                }
            });
        });
    }

    // Diğer sekme/dashboard'dan gelen değişiklikleri dinle
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.activeProject || changes.projectNames)) {
            if (document.getElementById('ilan-asistani-ui')) loadProjects();
        }
    });
}

/** Veri Çek butonu */
function setupScrapeButton() {
    const btnScrape = document.getElementById('btnScrapeInfo');
    if (!btnScrape) return;

    btnScrape.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const statusEl = document.getElementById('scrapeStatus');
        statusEl.innerHTML = '⏳ İşleniyor...';
        statusEl.style.color = '#e67e22';

        const result = await scrapeListing();

        statusEl.innerHTML = result.message;
        statusEl.style.color = result.success ? '#28a745' : '#dc3545';

        if (result.success) setTimeout(() => statusEl.innerHTML = '', 4000);
    });
}

/** Hızlı Ekle butonu */
function setupQuickAddButton(scraper) {
    const btnFloatAdd = document.getElementById('btnFloatAdd');
    if (!btnFloatAdd) return;

    btnFloatAdd.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const statusEl = document.getElementById('scrapeStatus');
        const brut = document.getElementById('floatBrut').value;
        const doluluk = document.getElementById('floatDoluluk').value;
        const aidat = document.getElementById('floatAidat').value;
        const kira = document.getElementById('floatKira').value;

        // Hafızada tut
        if (doluluk) chrome.storage.local.set({ lastOccupancyRate: doluluk });

        // Guard: Boş form kontrolü
        if (!brut && !aidat && !kira) {
            statusEl.innerHTML = '⚠️ Değer giriniz.';
            statusEl.style.color = '#dc3545';
            return;
        }

        const title = scraper.getTitle();
        const link = window.location.href;
        const brutVal = DOMHelpers.clean(brut);
        const aidatVal = DOMHelpers.clean(aidat);
        const kiraVal = DOMHelpers.clean(kira);

        // Aidat/m² hesabı
        const aidatM2 = (brutVal > 0 && aidatVal > 0) ? (aidatVal / brutVal).toFixed(2) : '';

        // Durum tespiti
        let currentDurum = 'Belirsiz';
        const items = document.querySelectorAll('.classifiedInfoList li');
        for (const item of items) {
            const txt = item.innerText;
            if (txt.includes('Durumu') || txt.includes('Boş/Dolu') || txt.includes('Kategori')) {
                if (txt.includes('Satılık')) currentDurum = 'Satılık';
                if (txt.includes('Kiralık')) currentDurum = 'Kiralık';
            }
        }
        // Fallback: başlıktan bak
        if (currentDurum === 'Belirsiz') {
            const tLower = document.title.toLowerCase();
            if (tLower.includes('satılık')) currentDurum = 'Satılık';
            if (tLower.includes('kiralık')) currentDurum = 'Kiralık';
        }

        // Eşyalı kontrolü
        const descText = scraper.getDescription();
        const isFurnished = scraper.checkFurnished(title, descText);

        // Birim fiyat (sadece kiralık + eşyasız)
        let unitPrice = '';
        if (currentDurum !== 'Satılık' && !isFurnished && brutVal > 0 && kiraVal > 0) {
            unitPrice = (kiraVal / brutVal).toFixed(2);
        }

        const currentProject = document.getElementById('projectSelect')?.value || 'Varsayılan';

        const newItem = {
            Baslik: title,
            Durum: currentDurum,
            Fiyat: kiraVal,
            Brut: brutVal,
            Net: (brutVal / 1.2).toFixed(0),
            Aidat: aidatVal === 0 ? '' : aidatVal,
            BirimFiyat: unitPrice === 0 ? '' : unitPrice,
            AidatM2: aidatM2,
            ImageUrl: DOMHelpers.getImageUrl(),
            Link: link,
            Not: 'Yüzen Panel Eklemesi',
            Doluluk: doluluk,
            project: currentProject
        };

        statusEl.innerHTML = '⏳ Kaydediliyor...';
        statusEl.style.color = '#e67e22';

        const result = await StorageManager.updateOrAddListing(newItem);

        statusEl.innerHTML = result.message;
        statusEl.style.color = result.isUpdate ? '#3498db' : '#28a745';

        // Inputları temizle
        document.getElementById('floatBrut').value = '';
        document.getElementById('floatAidat').value = '';
        document.getElementById('floatKira').value = '';
        setTimeout(() => statusEl.innerHTML = '', 3000);
    });
}

/**
 * Eklenti bağlamının hâlâ geçerli olup olmadığını kontrol eder.
 * chrome.runtime.id tanımsız ise bağlam geçersiz kılınmıştır.
 */
function isContextValid() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
        return false;
    }
}

/** Dashboard aç butonu */
function setupDashboardButton() {
    const btn = document.getElementById('btnOpenDash');
    if (!btn) return;

    // Fare butona yaklaşınca SW'üyönceden uyandır — tıklama anında hazır olsun.
    btn.addEventListener('mouseenter', () => {
        if (isContextValid()) {
            chrome.runtime.sendMessage({ action: 'PING' }).catch(() => {});
        }
    });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isContextValid()) {
            const statusEl = document.getElementById('scrapeStatus');
            if (statusEl) {
                statusEl.innerHTML = '⚠️ Eklenti güncellendi. Lütfen sayfayı yenileyin (F5).';
                statusEl.style.color = '#e67e22';
            }
            return;
        }

        // Anında görsel geri bildirim ver
        const statusEl = document.getElementById('scrapeStatus');
        if (statusEl) {
            statusEl.innerHTML = '⏳ Panel açılıyor...';
            statusEl.style.color = '#6c757d';
        }

        // Brave, content script'ten window.open ile eklenti URL'si açılmasını engelliyor.
        // Bu yüzden açma işlemini background.js'e (chrome.tabs.create) devrediyoruz.
        chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' }, () => {
            if (statusEl) statusEl.innerHTML = '';
        });
    });
}

// ════════════════════════════════════════════
//  BAŞLAT
// ════════════════════════════════════════════
injectUI();

if (typeof MapDragHandler !== 'undefined') {
    MapDragHandler.init();
}

// ════════════════════════════════════════════
//  SERVICE WORKER UYANIK TUT (Keepalive)
// ════════════════════════════════════════════
// Manifest V3'te background.js (Service Worker) işlem yokken uyuyor.
// Bu port bağlantısı SW'yi sayfa açık olduğu sürece uyanık tutar;
// böylece 'Paneli Aç' butonuna basınca 5 saniyelik uyandırma gecikmesi olmaz.
(function keepServiceWorkerAlive() {
    if (!isContextValid()) return;
    try {
        const port = chrome.runtime.connect({ name: 'keepalive' });
        port.onDisconnect.addListener(() => {
            // SW uyuduysa veya bağlantı koptu — yeniden bağlan
            setTimeout(() => {
                if (isContextValid()) keepServiceWorkerAlive();
            }, 1000);
        });
    } catch (e) {
        // Context geçersiz olmuşsa sessizce geç
    }
})();

// ════════════════════════════════════════════
//  MESAJ DİNLEYİCİ
// ════════════════════════════════════════════
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCRAPE_LISTING') {
        scrapeListing().then(response => sendResponse(response));
        return true; // Async response
    }
});
