/**
 * HepsiEmlakScraper — hepsiemlak.com'a özel ilan kazıyıcı.
 * BaseScraper'dan türer, sadece site özel kuralları içerir.
 */
class HepsiEmlakScraper extends BaseScraper {
    constructor() {
        super({
            name: 'hepsiemlak',
            selectors: {
                title:       'h1.fontRB',
                description: '.tab-content.det-block',
                price:       '.fz24-text.price'
            }
        });
    }

    /**
     * Yalnızca hepsiemlak.com detay sayfalarında aktifleşir.
     * Liste sayfaları /\d+-\d+$ ile bitmez, dolayısıyla filtrelenir.
     */
    detect() {
        return window.location.hostname.includes('hepsiemlak.com') &&
               /\/\d+-\d+$/.test(window.location.pathname);
    }

    async scrape() {
        // ── 1. SPEC HASHMAP: Tüm özellik tablosunu tek seferde oku ──
        const specMap = this._buildSpecMap();

        // ── 2. TEMEL ALANLAR ──
        const title    = this.getTitle();
        const descText = this.getDescription();
        const descLower = descText.toLocaleLowerCase('tr-TR');
        const price    = this.getPrice();

        // ── 3. ALAN (m²) — "110 m2 / 100 m2" formatını ayrıştır ──
        const brutNetRaw = specMap['Brüt / Net M2'] || '';
        // m[²2]?: hem "m²" (süperskript) hem "m2" (rakam) hem de salt "m" eşleşir
        const brutNetMatch = brutNetRaw.replace(/\s+/g, ' ').match(/(\d+)\s*m[²2]?\s*\/\s*(\d+)/i);

        let brut = brutNetMatch ? DOMHelpers.clean(brutNetMatch[1]) : 0;
        let net  = brutNetMatch ? DOMHelpers.clean(brutNetMatch[2]) : 0;

        // Fallback: yalnızca tek değer varsa (örn. "110 m²" veya "110 m2")
        if (brut === 0) {
            const singleMatch = brutNetRaw.match(/(\d+)\s*m[²2]?/i);
            if (singleMatch) brut = DOMHelpers.clean(singleMatch[1]);
        }

        // ── 4. GELİŞMİŞ M² PARSER (AdvancedAreaParser fallback) ──
        let isTahmin = false;
        const parsed = AdvancedAreaParser.parse(title + ' ' + descLower);

        if (brut === 0 && parsed.brut > 0) brut = parsed.brut;
        if ((net === 0 || net === brut) && parsed.net > 0) net = parsed.net;
        if (parsed.isTahmin) isTahmin = true;

        if (brut > 0 && net > 0 && brut === net && parsed.net > 0 && parsed.net < brut) {
            net = parsed.net;
        }

        // ── 5. AİDAT ──
        let aidat = DOMHelpers.clean(specMap['Aidat'] || specMap['Aidat (TL)'] || '0');
        if (aidat === 0) aidat = this._parseAidatFromDesc(descLower);

        // ── 6. DURUM (Satılık / Kiralık) ──
        const durumRaw = (specMap['İlan Durumu'] || '').trim();
        const tip      = (specMap['Konut Tipi']  || '').trim();
        let durum      = [durumRaw, tip].filter(Boolean).join(' ');

        const checkStr = (durum + ' ' + window.location.href).toLocaleLowerCase('tr-TR');
        const { isSatilik, isKiralik } = this.detectStatus(checkStr);

        if (!durum) durum = 'Belirsiz';

        // ── 7. EŞYALI ──
        const esyaDurum = (specMap['Eşya Durumu'] || '').trim();
        let isFurnished;
        if (esyaDurum) {
            isFurnished = /eşyalı/i.test(esyaDurum) && !/değil/i.test(esyaDurum);
        } else {
            isFurnished = this.checkFurnished(title, descText);
        }

        // ── 8. İLETİŞİM BİLGİLERİ ──
        const firmCard  = document.querySelector('.firm-card');
        const isCorporate = !!firmCard;

        let officeName = '';
        let agentName  = '';
        let phones     = '';

        if (isCorporate) {
            officeName = (document.querySelector('.firm-name')?.innerText || '').trim();

            const agentSubEl = document.querySelector('.firm-card-detail .detail-sub');
            if (agentSubEl) {
                agentName = agentSubEl.innerText
                    .replace(/Mesleki Yeterlilik Belgesine Sahiptir/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            const phoneEl = document.querySelector('.owner-phone-numbers-list');
            phones = phoneEl ? phoneEl.innerText.replace(/\s+/g, ' ').trim() : '';
        }

        // ── 9. HESAPLAMALAR ──
        const aidatM2  = (brut > 0 && aidat > 0) ? (aidat / brut).toFixed(2) : 0;
        const unitPrice = (!isSatilik && brut > 0 && !isFurnished)
            ? (price / brut).toFixed(2) : 0;

        return {
            source: '',
            title, durum, price, brut, net, aidat,
            unitPrice, aidatM2, isTahmin, isSatilik, isFurnished,
            officeName, agentName, phones,
            isIndividual: !isCorporate,
            imageUrl: this.getImageUrl(),
            link: DOMHelpers.normalizeUrl(window.location.href)
        };
    }

    // ─── PRIVATE ───

    /**
     * .adv-info-list içindeki spec-item'lardan key→value haritası oluşturur.
     * Her satırda: <th class="txt">Anahtar</th> <td>Değer</td>
     * @returns {Object<string, string>}
     */
    _buildSpecMap() {
        const map = {};
        const items = document.querySelectorAll('.adv-info-list .spec-item');
        for (const item of items) {
            const key = item.querySelector('th.txt')?.innerText?.trim().replace(/:$/, '');
            const val = item.querySelector('td')?.innerText?.trim();
            if (key && val) map[key] = val;
        }
        return map;
    }

    /**
     * Aidatı ilan açıklamasında arar (tablo boşsa fallback).
     * @private
     */
    _parseAidatFromDesc(descLower) {
        const regex = /(?:aidat|aidatı)(?:\s+bedeli)?\s*[:\s]*(\d+(?:[.,]\d+)*)/i;
        const match = descLower.match(regex);
        if (!match) return 0;
        const val = DOMHelpers.clean(match[1]);
        return val > 0 ? val : 0;
    }
}
