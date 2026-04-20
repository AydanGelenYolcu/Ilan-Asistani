/**
 * MapDragHandler — Harita sayfasında Drag & Drop özelliği.
 *
 * 1. MutationObserver ile yeni eklenen harita pinlerini algılar
 * 2. Her pine draggable özelliği ekler
 * 3. Yüzen paneli (ilan-asistani-ui) Drop Zone'a dönüştürür
 * 4. Pin bırakıldığında MapScraper ile detay çeker ve kaydeder
 */
const MapDragHandler = {

    /** Harita sayfasında mıyız? */
    isMapPage() {
        const path = window.location.pathname.toLocaleLowerCase('tr-TR');
        return path.includes('harita') || path.includes('map');
    },

    /** Olası marker CSS seçicileri — test sırasında doğrulanmalı */
    MARKER_SELECTORS: [
        '.mapResultItem',           // Sahibinden harita sonuç öğesi
        '.map-marker',              // Genel harita marker
        '.map-label',               // Harita etiket overlay
        '.leaflet-marker-icon',     // Leaflet marker
        '[data-listing-id]',        // Data attribute bazlı
        '.realestate-map-marker',   // Emlak harita marker
        '.classified-marker',       // İlan marker
        '.gm-style [role="button"]' // Google Maps overlay butonları
    ],

    /** Observer referansı */
    _observer: null,

    /** Sayaç */
    _processedCount: 0,

    /**
     * Ana başlatma fonksiyonu.
     * Harita sayfasındaysa observer'ı ve drop zone'u kurar.
     */
    init() {
        if (!this.isMapPage()) return;

        console.log('[İlan Asistanı] 🗺️ Harita modu aktif — Drag & Drop başlatılıyor...');

        // Mevcut pinleri işle
        this._processExistingMarkers();

        // Yeni pinleri izle
        this._startObserver();

        // Drop Zone kur
        this._setupDropZone();

        // Harita sonuç listesini de izle (sol panel)
        this._observeResultsList();
    },

    /**
     * Sayfada zaten bulunan marker'ları draggable yapar.
     * @private
     */
    _processExistingMarkers() {
        const markers = this._findAllMarkers();
        markers.forEach(marker => this._makeMarkerDraggable(marker));
        if (markers.length > 0) {
            console.log(`[İlan Asistanı] 📌 ${markers.length} mevcut pin bulundu ve sürüklenebilir yapıldı.`);
        }
    },

    /**
     * Tüm olası marker seçicilerini tarar.
     * @private
     * @returns {Element[]}
     */
    _findAllMarkers() {
        const all = new Set();
        for (const selector of this.MARKER_SELECTORS) {
            try {
                document.querySelectorAll(selector).forEach(el => all.add(el));
            } catch (e) { /* Geçersiz seçici — atla */ }
        }
        return Array.from(all);
    },

    /**
     * Tek bir marker'ı sürüklenebilir yapar.
     * @private
     */
    _makeMarkerDraggable(marker) {
        // Guard: Zaten işlenmiş mi?
        if (marker.dataset.ilanDraggable === 'true') return;
        marker.dataset.ilanDraggable = 'true';

        marker.setAttribute('draggable', 'true');
        marker.style.cursor = 'grab';

        marker.addEventListener('dragstart', (e) => {
            // İlan URL'sini veya ID'sini bul
            const listingUrl = this._extractListingUrl(marker);
            if (!listingUrl) {
                console.warn('[İlan Asistanı] Pin URL\'si bulunamadı:', marker);
                return;
            }

            e.dataTransfer.setData('text/plain', listingUrl);
            e.dataTransfer.effectAllowed = 'copy';

            // Görsel geri bildirim
            marker.style.opacity = '0.5';
            marker.style.transform = 'scale(1.2)';
        });

        marker.addEventListener('dragend', (e) => {
            marker.style.opacity = '1';
            marker.style.transform = 'scale(1)';
        });

        this._processedCount++;
    },

    /**
     * Marker elementinden ilan URL'sini çıkarır.
     * Birden fazla strateji dener.
     * @private
     */
    _extractListingUrl(marker) {
        // Strateji 1: Doğrudan link
        const link = marker.querySelector('a[href*="/ilan/"]') ||
            marker.closest('a[href*="/ilan/"]');
        if (link) return link.href;

        // Strateji 2: data-* attribute
        const id = marker.dataset.listingId ||
            marker.dataset.id ||
            marker.dataset.classifiedId ||
            marker.getAttribute('data-id');
        if (id) return `https://www.sahibinden.com/ilan/${id}`;

        // Strateji 3: href attribute (varsa)
        const href = marker.getAttribute('href');
        if (href && href.includes('/ilan/')) {
            return href.startsWith('http') ? href : 'https://www.sahibinden.com' + href;
        }

        // Strateji 4: İç HTML'den ID çekme (son çare)
        const html = marker.innerHTML || marker.outerHTML;
        const idMatch = html.match(/\/ilan\/(\d+)/);
        if (idMatch) return `https://www.sahibinden.com/ilan/${idMatch[1]}`;

        // Strateji 5: onClick handler'dan URL çekme
        const onclick = marker.getAttribute('onclick') || '';
        const urlMatch = onclick.match(/['"]([^'"]*\/ilan\/[^'"]*)['"]/);
        if (urlMatch) return urlMatch[1];

        return null;
    },

    /**
     * MutationObserver başlatır — dinamik yüklenen pinleri yakalar.
     * @private
     */
    _startObserver() {
        if (this._observer) this._observer.disconnect();

        this._observer = new MutationObserver((mutations) => {
            let newMarkersFound = 0;

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;

                    // Eklenen node kendisi marker mı?
                    for (const selector of this.MARKER_SELECTORS) {
                        try {
                            if (node.matches && node.matches(selector)) {
                                this._makeMarkerDraggable(node);
                                newMarkersFound++;
                            }
                        } catch (e) { /* Geçersiz seçici */ }
                    }

                    // Eklenen node'un altındaki marker'lar
                    if (node.querySelectorAll) {
                        for (const selector of this.MARKER_SELECTORS) {
                            try {
                                node.querySelectorAll(selector).forEach(child => {
                                    this._makeMarkerDraggable(child);
                                    newMarkersFound++;
                                });
                            } catch (e) { /* Geçersiz seçici */ }
                        }
                    }
                }
            }

            if (newMarkersFound > 0) {
                console.log(`[İlan Asistanı] 📌 ${newMarkersFound} yeni pin algılandı — toplam: ${this._processedCount}`);
            }
        });

        // Tüm sayfayı gözle (harita pinleri her yerde olabilir)
        this._observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    /**
     * Harita sonuç listesindeki öğeleri de sürüklenebilir yapar.
     * Sol paneldeki "Harita sonuçları" listesi.
     * @private
     */
    _observeResultsList() {
        // Sahibinden harita sonuçları genellikle bir listede gösterilir
        const resultSelectors = [
            '.searchResultsRowClass',
            '.searchResultsItem',
            '.mapResultListing',
            '[data-id]'
        ];

        setTimeout(() => {
            for (const sel of resultSelectors) {
                try {
                    document.querySelectorAll(sel).forEach(item => {
                        this._makeMarkerDraggable(item);
                    });
                } catch (e) { /* Geçersiz seçici */ }
            }
        }, 2000); // Harita yüklenmesini bekle
    },

    /**
     * Yüzen paneli Drop Zone'a dönüştürür.
     * @private
     */
    _setupDropZone() {
        // Panel henüz inject edilmemiş olabilir, retry mekanizması
        const trySetup = () => {
            const panel = document.getElementById('ilan-asistani-ui');
            if (!panel) {
                setTimeout(trySetup, 1000);
                return;
            }

            // Zaten kurulmuş mu?
            if (panel.dataset.dropZoneActive === 'true') return;
            panel.dataset.dropZoneActive = 'true';

            // Drop Zone etiketi ekle
            const dropLabel = document.createElement('div');
            dropLabel.id = 'dropZoneLabel';
            dropLabel.innerHTML = '🗺️ <strong>Harita Modu:</strong> Pinleri buraya sürükle';
            Object.assign(dropLabel.style, {
                padding: '8px', margin: '8px 0', background: '#e8f5e9',
                borderRadius: '4px', fontSize: '12px', color: '#2e7d32',
                textAlign: 'center', border: '1px dashed #4caf50',
                display: 'block'
            });

            // uiContent'in başına ekle
            const uiContent = panel.querySelector('#uiContent');
            if (uiContent) {
                uiContent.insertBefore(dropLabel, uiContent.firstChild);
            }

            const origBorder = panel.style.border;
            const origBg = panel.style.background;

            // ── Drag Over ──
            panel.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                panel.style.border = '2px solid #4caf50';
                panel.style.background = '#e8f5e9';
                panel.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.4)';
            });

            // ── Drag Leave ──
            panel.addEventListener('dragleave', (e) => {
                panel.style.border = origBorder;
                panel.style.background = origBg;
                panel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            });

            // ── Drop ──
            panel.addEventListener('drop', async (e) => {
                e.preventDefault();

                // Stil resetle
                panel.style.border = origBorder;
                panel.style.background = origBg;
                panel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

                const listingUrl = e.dataTransfer.getData('text/plain');
                if (!listingUrl) return;

                const statusEl = document.getElementById('scrapeStatus');
                if (!statusEl) return;

                // Guard: Geçerli URL mi?
                if (!listingUrl.includes('sahibinden.com') && !listingUrl.includes('/ilan/')) {
                    statusEl.innerHTML = '⚠️ Geçersiz ilan bağlantısı';
                    statusEl.style.color = '#dc3545';
                    return;
                }

                // Proje
                const project = document.getElementById('projectSelect')?.value || 'Varsayılan';

                // Durum göster
                statusEl.innerHTML = '⏳ Detay çekiliyor...';
                statusEl.style.color = '#e67e22';

                // MapScraper ile çek ve kaydet
                const result = await MapScraper.scrapeAndSave(listingUrl, project);

                statusEl.innerHTML = result.message;
                statusEl.style.color = result.success ? '#28a745' : '#dc3545';

                if (result.success) {
                    // Kısa başarı animasyonu
                    panel.style.boxShadow = '0 0 20px rgba(40, 167, 69, 0.5)';
                    setTimeout(() => {
                        panel.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        statusEl.innerHTML = '';
                    }, 3000);
                }
            });

            console.log('[İlan Asistanı] ✅ Drop Zone aktif — pinleri panele sürükleyebilirsiniz.');
        };

        trySetup();
    }
};
