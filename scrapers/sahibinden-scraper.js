/**
 * SahibindenScraper — sahibinden.com'a özel ilan kazıyıcı.
 * BaseScraper'dan türer, sadece site özel kuralları içerir.
 */
class SahibindenScraper extends BaseScraper {
    constructor() {
        super({
            name: 'sahibinden',
            selectors: {
                title: '.classifiedDetailTitle h1',
                description: '#classifiedDescription',
                price: '.classifiedInfo h3',
                infoList: '.classifiedInfoList li',
                features: '#classifiedProperties li.selected',
                injectTarget: '.classifiedInfo'
            }
        });
    }

    detect() {
        return window.location.hostname.includes('sahibinden.com');
    }

    async scrape() {
        // ── 1. AYIKLAMA (Extract) ──
        const title = this.getTitle();
        const descText = this.getDescription();
        const descLower = descText.toLocaleLowerCase('tr-TR');
        const price = this.getPrice();

        // ── 2. HASHMAP: Tek seferde tüm bilgi tablosunu oku ──
        const infoMap = DOMHelpers.scrapeAllInfo(this.selectors.infoList);

        // ── 3. ALAN (Area) — HashMap'ten O(1) erişim ──
        // Spesifik Brüt etiketlerini ara; bulunmazsa generic m²'ye düş ve "ambiguous" işaretle.
        const specificBrut = DOMHelpers.clean(
            DOMHelpers.getFromMap(infoMap, [
                'm² (Brüt)', 'm2 (Brüt)', 'Brüt', 'Brüt m²', 'Toplam m²', 'Kullanım Alanı', 'Brüt Alan',
                'm² (Gross)', 'm2 (Gross)', 'Gross', 'Gross Area', 'Total Area'
            ])
        );
        const genericM2 = specificBrut === 0
            ? DOMHelpers.clean(DOMHelpers.getFromMap(infoMap, ['m²', 'm2', 'Metrekare']))
            : 0;
        let brut = specificBrut > 0 ? specificBrut : genericM2;
        // Etikette "Brüt" yazmıyorsa bu değer Brüt mü Net mi belirsiz — açıklama parser'ı netleştirir.
        const isBrutAmbiguous = specificBrut === 0 && genericM2 > 0;

        let net = DOMHelpers.clean(
            DOMHelpers.getFromMap(infoMap, [
                'm² (Net)', 'm2 (Net)', 'Net', 'Net m²', 'Net Alan', 'Faydalı Alan',
                'Net Area', 'Usable Area'
            ])
        );

        // ── 4. AİDAT ──
        let aidat = DOMHelpers.clean(DOMHelpers.getFromMap(infoMap, [
            'Aidat', 'Aidat (TL)', 'Maintenance Fee', 'Maintenance Fee (TL)', 'Maintenance'
        ]));
        if (aidat === 0) aidat = this._parseAidatFromDesc(descLower);

        // ── 5. DURUM (Status) — HashMap'ten oku ──
        // ÖNEMLİ: 'Emlak Tipi' önce aranmalı! 'Durumu' araması 'İmar Durumu'nu
        // kısmen eşleştirir ve 'Konut' döndürür, bu da Satılık algılamayı bozar.
        const emlakTipi = DOMHelpers.getFromMap(infoMap, ['Emlak Tipi', 'Real Estate Type', 'Property Type']);
        let durum = emlakTipi !== '0' ? emlakTipi : DOMHelpers.getFromMap(infoMap, ['Durumu', 'Real Estate', 'Listing Type']);
        const kategori = DOMHelpers.getFromMap(infoMap, ['Kategori', 'Category']);
        // emlakTipi'ni her zaman checkStr'e ekle; URL path iş yeri gibi kategoriler için güvenlik ağı
        // (iş yeri ilanlarında tabloda ne "Emlak Tipi" ne "İlan Durumu" olur, sadece URL'de "satilik/kiralik" geçer)
        const checkStr = (durum + ' ' + kategori + ' ' + title + ' ' + emlakTipi + ' ' + window.location.pathname).toLocaleLowerCase('tr-TR');
        const { isSatilik, isKiralik } = this.detectStatus(checkStr);

        // Guard: Durum label düzeltmesi
        if (!durum || durum === '0') durum = kategori;
        if (durum === '0') durum = 'Belirsiz';
        if (isSatilik && !/sat[ıi]l[ıi]k|for\s+sale/i.test(durum)) durum = 'Satılık ' + durum;
        if (isKiralik && !/kiral[ıi]k|for\s+rent/i.test(durum)) durum = 'Kiralık ' + durum;

        // ── 5. GELİŞMİŞ M² PARSER ──
        let isTahmin = false;
        const parsed = AdvancedAreaParser.parse(title + ' ' + descLower);

        if (brut === 0 && parsed.brut > 0) brut = parsed.brut;
        if ((net === 0 || net === brut) && parsed.net > 0) net = parsed.net;
        if (parsed.isTahmin) isTahmin = true;

        // Tablo Brut=Net ama parser farklı Net bulmuşsa, parser'a güven
        if (brut > 0 && net > 0 && brut === net && parsed.net > 0 && parsed.net < brut) {
            net = parsed.net;
        }

        // ── Generic m² (etiketsiz) durumunda açıklamadan gelen kesin bilgiye güven ──
        if (isBrutAmbiguous) {
            // 1) Açıklama KESİN Brüt verdi (Net'ten 1.2'lik tahmin değil)
            //    → Generic etiketsiz değeri geçersiz kıl, açıklamadakini al
            if (parsed.brut > 0 && !parsed.isTahmin && parsed.brut !== brut) {
                brut = parsed.brut;
                if (parsed.net > 0) net = parsed.net;
            }
            // 2) Açıklama sadece NET verdi (parser brut'u 1.2 ile tahmin etmiş)
            //    + generic m² değeri tam olarak Net'e eşit
            //    → Bu sayı aslında Net, Brüt'ü tahmini olarak yeniden hesapla
            else if (parsed.net > 0 && parsed.net === brut) {
                net = brut;
                brut = Math.round(brut * 1.2);
                isTahmin = true;
            }
        }

        // ── 6. EŞYALI KONTROLÜ ──
        // Önce bilgi tablosundan kesin değeri ara; yoksa eski mantığa düş
        const furnishedVal = DOMHelpers.getFromMap(infoMap, ['Eşyalı', 'Furnished']);
        let isFurnished;
        if (/^\s*(Evet|Yes)\s*$/i.test(furnishedVal)) {
            isFurnished = true;
        } else if (/^\s*(Hayır|No)\s*$/i.test(furnishedVal)) {
            isFurnished = false;
        } else {
            isFurnished = this.checkFurnished(title, descText);
        }

        // ── 7. İLETİŞİM BİLGİLERİ (Contact Info) ──
        const corpusElement = document.querySelector('.user-info-module');
        const isCorporate = !!corpusElement;

        let officeName = '';
        let agentName = '';
        let phones = '';

        if (isCorporate) {
            officeName = document.querySelector('.user-info-store-name a')?.innerText?.trim() || '';
            agentName = document.querySelector('.user-info-agent h3')?.innerText?.trim() || '';
            const phoneEls = document.querySelectorAll('.user-info-phones dd');
            phones = Array.from(phoneEls).map(dd => dd.innerText.trim()).join(' / ');
        }

        // ── 8. HESAPLAMALAR ──
        const aidatM2 = (brut > 0 && aidat > 0) ? (aidat / brut).toFixed(2) : 0;
        const unitPrice = (!isSatilik && brut > 0 && !isFurnished)
            ? (price / brut).toFixed(2) : 0;

        return {
            source: '',
            title, durum, price, brut, net, aidat,
            unitPrice, aidatM2, isTahmin, isSatilik, isFurnished,
            officeName, agentName, phones,
            isIndividual: !isCorporate,
            isVirtualOffice: this.isVirtualOffice(title, descText),
            imageUrl: this.getImageUrl(),
            link: DOMHelpers.normalizeUrl(window.location.href)
        };
    }

    /**
     * Aidatı ilan açıklamasında arar (tablo boşsa fallback).
     * @private
     */
    _parseAidatFromDesc(descLower) {
        const regex = /(?:aidat|aidatı|maintenance(?:\s+fee)?)(?:\s+bedeli)?\s*[:\s]*(\d+(?:[.,]\d+)*)/i;
        const match = descLower.match(regex);
        if (!match) return 0;
        const val = DOMHelpers.clean(match[1]);
        return val > 0 ? val : 0;
    }
}
