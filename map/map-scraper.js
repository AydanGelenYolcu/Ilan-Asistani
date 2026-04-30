/**
 * MapScraper — Harita sayfasından ilan detaylarını arka planda çeker.
 *
 * Harita üzerinde sadece fiyat ve konum görünür. Tüm detayları almak için
 * fetch() ile ilan detay sayfasının HTML'ini çekip DOMParser ile parse eder.
 * Bu sayede sayfa değiştirmeden arka planda veri toplanır.
 */
const MapScraper = {

    /**
     * İlan detay sayfasını fetch edip parse eder.
     * @param {string} listingUrl — İlan detay URL'si (örn: https://www.sahibinden.com/ilan/...)
     * @returns {Promise<object>} — Scrape edilmiş veri objesi
     */
    async fetchAndParse(listingUrl) {
        // Guard: URL kontrolü
        if (!listingUrl || !listingUrl.includes('sahibinden.com')) {
            throw new Error('Geçersiz ilan URL\'si');
        }

        // 1. Sayfayı fetch et (same-origin, cookie'ler korunur)
        const response = await fetch(listingUrl, {
            credentials: 'include',
            headers: {
                'Accept': 'text/html',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (!response.ok) {
            throw new Error(`Sayfa yüklenemedi (HTTP ${response.status})`);
        }

        const html = await response.text();

        // 2. Sanal DOM oluştur
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 3. Sanal DOM üzerinden veri çek (aynı selectorlar)
        return this._extractFromDocument(doc, listingUrl);
    },

    /**
     * Parse edilmiş Document'ten veri çıkarır.
     * SahibindenScraper ile aynı mantığı kullanır ama farklı document üzerinde.
     * @private
     */
    _extractFromDocument(doc, listingUrl) {
        // ── Yardımcı: Sanal DOM'dan getVal ──
        const getVal = (keys) => {
            const items = doc.querySelectorAll('.classifiedInfoList li');
            for (const item of items) {
                const lbl = item.querySelector('strong')?.textContent || '';
                if (lbl.includes('Tapu')) continue;
                for (const k of keys) {
                    if (lbl.includes(k)) {
                        return item.querySelector('span')?.textContent?.trim() || '0';
                    }
                }
            }
            return '0';
        };

        // ── Başlık ──
        const titleEl = doc.querySelector('.classifiedDetailTitle h1') || doc.querySelector('meta[property="og:title"]');
        const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('content') || '').trim() : 'Harita İlanı';

        // ── Açıklama ──
        const descEl = doc.querySelector('#classifiedDescription');
        const descText = descEl ? descEl.textContent : '';
        const descLower = descText.toLocaleLowerCase('tr-TR');

        // ── Fiyat (Öncelikli: Meta Tags -> Özel Class -> Genel H3) ──
        let rawPrice = '0';
        const metaPrice = doc.querySelector('meta[property="og:price:amount"]');
        const wrapperPrice = doc.querySelector('.classified-price-wrapper');
        const h3Price = doc.querySelector('.classifiedInfo h3');

        if (metaPrice && metaPrice.getAttribute('content')) {
            rawPrice = metaPrice.getAttribute('content');
        } else if (wrapperPrice) {
            rawPrice = wrapperPrice.textContent;
        } else if (h3Price) {
            rawPrice = h3Price.textContent;
        }

        const price = DOMHelpers.clean(rawPrice);

        // ── Alan ──
        // Spesifik Brüt etiketlerini ara; bulunmazsa generic m²'ye düş ve "ambiguous" işaretle.
        const specificBrut = DOMHelpers.clean(
            getVal([
                'm² (Brüt)', 'm2 (Brüt)', 'Brüt', 'Brüt m²', 'Toplam m²', 'Kullanım Alanı', 'Brüt Alan',
                'm² (Gross)', 'm2 (Gross)', 'Gross', 'Gross Area', 'Total Area'
            ])
        );
        const genericM2 = specificBrut === 0
            ? DOMHelpers.clean(getVal(['m²', 'm2', 'Metrekare']))
            : 0;
        let brut = specificBrut > 0 ? specificBrut : genericM2;
        const isBrutAmbiguous = specificBrut === 0 && genericM2 > 0;

        let net = DOMHelpers.clean(
            getVal([
                'm² (Net)', 'm2 (Net)', 'Net', 'Net m²', 'Net Alan', 'Faydalı Alan',
                'Net Area', 'Usable Area'
            ])
        );

        // ── Aidat ──
        let aidat = DOMHelpers.clean(getVal(['Aidat', 'Aidat (TL)', 'Maintenance Fee', 'Maintenance Fee (TL)', 'Maintenance']));
        if (aidat === 0) {
            const aidatRegex = /(?:aidat|aidatı|maintenance(?:\s+fee)?)(?:\s+bedeli)?\s*[:\s]*(\d+(?:[.,]\d+)*)/i;
            const aidatMatch = descLower.match(aidatRegex);
            if (aidatMatch) {
                const parsed = DOMHelpers.clean(aidatMatch[1]);
                if (parsed > 0) aidat = parsed;
            }
        }

        // ── Durum ──
        // 'Emlak Tipi' öncelikli: 'Durumu' → 'İmar Durumu' kısmi eşleşme hatası önlenir
        const emlakTipi = getVal(['Emlak Tipi', 'Real Estate Type', 'Property Type']);
        let durum = (emlakTipi && emlakTipi !== '0') ? emlakTipi : getVal(['Durumu', 'Real Estate', 'Listing Type']);
        const kategori = getVal(['Kategori', 'Category']);
        const checkStr = (durum + ' ' + kategori + ' ' + title + ' ' + emlakTipi).toLocaleLowerCase('tr-TR');
        const isSatilik = /sat[ıi]l[ıi]k|for\s+sale/i.test(checkStr);
        const isKiralik = /kiral[ıi]k|for\s+rent/i.test(checkStr);

        if (!durum || durum === '0') durum = kategori;
        if (durum === '0') durum = 'Belirsiz';
        if (isSatilik && !/sat[ıi]l[ıi]k|for\s+sale/i.test(durum)) durum = 'Satılık ' + durum;
        if (isKiralik && !/kiral[ıi]k|for\s+rent/i.test(durum)) durum = 'Kiralık ' + durum;

        // ── Gelişmiş m² Parser ──
        let isTahmin = false;
        const parsed = AdvancedAreaParser.parse(title + ' ' + descLower);
        if (brut === 0 && parsed.brut > 0) brut = parsed.brut;
        if ((net === 0 || net === brut) && parsed.net > 0) net = parsed.net;
        if (parsed.isTahmin) isTahmin = true;
        if (brut > 0 && net > 0 && brut === net && parsed.net > 0 && parsed.net < brut) {
            net = parsed.net;
        }

        // ── Generic m² (etiketsiz) durumunda açıklamadaki kesin bilgiye güven ──
        if (isBrutAmbiguous) {
            // 1) Açıklama KESİN Brüt verdi → açıklamadakini kullan
            if (parsed.brut > 0 && !parsed.isTahmin && parsed.brut !== brut) {
                brut = parsed.brut;
                if (parsed.net > 0) net = parsed.net;
            }
            // 2) Açıklama sadece NET verdi + generic değer Net'e eşit
            //    → Bu sayı aslında Net, Brüt'ü tahmini olarak yeniden hesapla
            else if (parsed.net > 0 && parsed.net === brut) {
                net = brut;
                brut = Math.round(brut * 1.2);
                isTahmin = true;
            }
        }

        // ── Eşyalı Kontrolü (TR + EN) ──
        // 1. Önce bilgi tablosundan kesin değeri ara
        const furnishedVal = getVal(['Eşyalı', 'Furnished']);
        let isFurnished;
        if (/^\s*(Evet|Yes)\s*$/i.test(furnishedVal)) {
            isFurnished = true;
        } else if (/^\s*(Hayır|No)\s*$/i.test(furnishedVal)) {
            isFurnished = false;
        } else {
            // 2. Tablo yoksa başlık + açıklama + özellikler kontrolüne düş
            isFurnished = false;
            const furnishedRegex = /(?:e[şs]yal[ıi]|mob[iı]l?yal[ıi]|\bfurnished\b)/i;
            if (furnishedRegex.test(title)) isFurnished = true;
            if (!isFurnished && descText) {
                const d = descText.toLocaleLowerCase('tr-TR');
                if (furnishedRegex.test(d) &&
                    !d.includes('eşyalı değil') && !d.includes('mobilyalı değil') &&
                    !d.includes('boş teslim') && !d.includes('boş olarak teslim') &&
                    !d.includes('unfurnished') && !d.includes('not furnished')) {
                    isFurnished = true;
                }
            }
            if (!isFurnished) {
                const features = doc.querySelectorAll('#classifiedProperties li.selected');
                for (const f of features) {
                    if (furnishedRegex.test(f.textContent.trim())) { isFurnished = true; break; }
                }
            }
        }

        // ── Hesaplamalar ──
        const aidatM2 = (brut > 0 && aidat > 0) ? (aidat / brut).toFixed(2) : 0;
        const unitPrice = (!isSatilik && brut > 0 && !isFurnished) ? (price / brut).toFixed(2) : 0;

        // ── Görsel ──
        const metaImg = doc.querySelector('meta[property="og:image"]');
        const mainImg = doc.querySelector('.classifiedDetailMainPhoto img');
        const imageUrl = metaImg ? metaImg.getAttribute('content') : (mainImg ? mainImg.getAttribute('src') : '');

        // ── İletişim Bilgileri (Contact Info) ──
        const corpusElement = doc.querySelector('.user-info-module');
        const isCorporate = !!corpusElement;

        let officeName = '';
        let agentName = '';
        let phones = '';

        if (isCorporate) {
            officeName = doc.querySelector('.user-info-store-name a')?.textContent?.trim() || '';
            agentName = doc.querySelector('.user-info-agent h3')?.textContent?.trim() || '';
            const phoneEls = doc.querySelectorAll('.user-info-phones dd');
            phones = Array.from(phoneEls).map(dd => dd.textContent.trim()).join(' / ');
        }

        return {
            title, durum, price, brut, net, aidat,
            unitPrice, aidatM2, isTahmin, isSatilik, isFurnished,
            officeName, agentName, phones,
            isIndividual: !isCorporate,
            imageUrl,
            link: DOMHelpers.normalizeUrl(listingUrl)
        };
    },

    /**
     * Fetch edilen veriyi doğrulayıp döviz çevirisiyle kaydeder.
     * scrapeListing() ile aynı pipeline'ı kullanır.
     * @param {string} listingUrl
     * @param {string} project
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async scrapeAndSave(listingUrl, project) {
        try {
            // 1. Fetch & Parse
            const rawData = await this.fetchAndParse(listingUrl);

            // 2. Doğrula
            const validation = ListingValidator.validate(rawData);
            if (!validation.isValid) {
                return { success: false, message: '❌ ' + validation.errors.join(', ') };
            }
            const data = validation.data;

            // 3. Döviz
            const currency = await CurrencyParser.getConversionData();
            const priceConv = CurrencyParser.convert(data.price, currency.rate);
            const aidatConv = CurrencyParser.convert(data.aidat, currency.rate);
            const unitPriceConv = CurrencyParser.convertDecimal(data.unitPrice, currency.rate);

            // 4. Kayıt objesi
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
                Link: data.link,
                ImageUrl: data.imageUrl,
                Not: (data.isTahmin ? 'Tahmini Brüt | ' : '') + '🗺️ Haritadan Eklendi',
                officeName: data.officeName,
                agentName: data.agentName,
                phones: data.phones,
                project: project
            };

            // 5. Kaydet
            return await StorageManager.addListing(newItem);

        } catch (e) {
            console.error('[MapScraper] Hata:', e);
            let msg = e.message;
            if (msg.includes('context invalidated')) {
                msg = 'Uzantı güncellendi. Lütfen sayfayı yenileyin.';
            }
            return { success: false, message: '❌ ' + msg };
        }
    }
};
