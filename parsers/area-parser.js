/**
 * AdvancedAreaParser — Gelişmiş m² ayrıştırma motoru.
 * Bağlamsal yakınlık (proximity) ve gürültü filtreleme ile
 * ilan metinlerinden Net/Brüt m² değerlerini çıkarır.
 */
const AdvancedAreaParser = {
    keywords: {
        brut: ['brüt', 'brut', 'toplam', 'toplam alan', 'genel alan'],
        net: ['net', 'net alan', 'kullanım alanı', 'faydalı alan', 'süpürülebilir alan']
    },
    units: /(?:m²|m2|metrekare)/i,

    /**
     * Akıllı sayı temizleyici — DOMHelpers.clean() ile aynı mantık.
     * TR/EN format otomatik algılamalı.
     */
    clean(val) {
        if (!val) return 0;
        let s = String(val).trim();
        s = s.replace(/[^0-9.,]/g, '');
        if (!s) return 0;

        const hasComma = s.includes(',');
        const hasDot = s.includes('.');

        if (hasComma && hasDot) {
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');
            if (lastComma > lastDot) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                s = s.replace(/,/g, '');
            }
        } else if (hasComma) {
            const parts = s.split(',');
            if (parts.length === 2 && parts[1].length <= 2) {
                s = s.replace(',', '.');
            } else {
                s = s.replace(/,/g, '');
            }
        } else if (hasDot) {
            const parts = s.split('.');
            if (parts.length === 2 && parts[1].length <= 2) {
                // Ondalık nokta, koru
            } else {
                s = parts.join('');
            }
        }

        return parseFloat(s) || 0;
    },

    /**
     * Bir sayının gerçekten alan bilgisi olup olmadığını doğrular.
     * Fiyat, kat numarası, 7/24 gibi yanıltıcı değerleri eler.
     */
    validateArea(val, keywordMatch, fullText) {
        // Guard: Mantıksız aralık
        if (val <= 0 || val > 10000) return false;

        const index = keywordMatch.index;
        const sub = fullText.substring(Math.max(0, index - 40), index + 60).toLowerCase();
        const endOfMatchIndex = index + keywordMatch[0].length;
        const afterVal = fullText.substring(endOfMatchIndex, endOfMatchIndex + 20).toLowerCase();

        // Guard: "7/24" pattern — sayıdan hemen sonra "/" geliyorsa reddet
        if (afterVal.trim().startsWith('/')) return false;

        // Guard: Para birimi gürültüsü
        const currencyNoise = ['tl', '₺', 'milyon', 'bin', 'usd', '$', 'euro', '€'];
        for (const noise of currencyNoise) {
            if (afterVal.trim().startsWith(noise)) return false;
        }

        // Guard: Küçük sayılarda m² birimi zorunlu (örn. "Net 7" → m² yoksa reddet)
        if (val < 25) {
            const hasUnit = AdvancedAreaParser.units.test(keywordMatch[0]) ||
                AdvancedAreaParser.units.test(afterVal);
            if (!hasUnit) return false;
        }

        // Guard: Kat numarası yakınlığı
        if (sub.includes(' kat') && !sub.includes('metrekare') && !sub.includes('m2')) {
            const katMatch = sub.match(/(\d+)\.?\s*kat/i) || sub.match(/kat\s*[:\s]*(\d+)/i);
            if (katMatch && AdvancedAreaParser.clean(katMatch[1]) === val) return false;
        }

        return true;
    },

    /**
     * Ana ayrıştırma fonksiyonu.
     * @param {string} text — İlan başlığı + açıklaması
     * @returns {{ brut: number, net: number, isTahmin: boolean }}
     */
    parse(text) {
        const t = text.toLocaleLowerCase('tr-TR');
        let brut = 0, net = 0, isTahmin = false;

        // Öncelik 0: Açık etiket çifti ("Brüt : 200 - Net : 170")
        const explicitPairRegex = /(?:brüt|bürüt|toplam)\s*(?:alan)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|metrekare)?\s*(?:[-–,;]|\s+)\s*(?:net|kullanım)\s*(?:alanı)?\s*[:\s]*(\d+(?:[.,]\d+)?)/gi;
        const epMatch = explicitPairRegex.exec(t);
        if (epMatch) {
            const v1 = this.clean(epMatch[1]);
            const v2 = this.clean(epMatch[2]);
            if (v1 > 0 && v2 > 0) {
                brut = v1;
                net = v2;
                if (net > brut) [brut, net] = [net, brut];
                return { brut, net, isTahmin };
            }
        }

        // Öncelik 1: Sayı çifti ("120/100", "150 - 110")
        const pairRegex = /(\d+(?:[.,]\d+)?)\s*(?:\/|-|—|–)\s*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|metrekare)?/gi;
        let pMatch;
        while ((pMatch = pairRegex.exec(t)) !== null) {
            const v1 = this.clean(pMatch[1]);
            const v2 = this.clean(pMatch[2]);
            if (v1 > 0 && v2 > 0) {
                brut = Math.max(v1, v2);
                net = Math.min(v1, v2);
                return { brut, net, isTahmin };
            }
        }

        // Öncelik 2: Bağlamsal anahtar kelime taraması (proximity 20 chars)
        const findInContext = (keyArray) => {
            for (const word of keyArray) {
                const boundary = '(?:^|[^a-zçğıöşü])';

                // Pattern 1: keyword ... sayı
                const re1 = new RegExp(`${boundary}${word}[^0-9]{0,25}(\\d+(?:[.,]\\d+)?)`, 'gi');
                // Pattern 2: sayı ... keyword
                const re2 = new RegExp(`(\\d+(?:[.,]\\d+)?)[^a-z0-9]{0,15}${word}`, 'gi');

                let m;
                while ((m = re1.exec(t)) !== null) {
                    const val = this.clean(m[1]);
                    if (this.validateArea(val, m, t)) return val;
                }
                while ((m = re2.exec(t)) !== null) {
                    const val = this.clean(m[1]);
                    if (this.validateArea(val, m, t)) return val;
                }
            }
            return 0;
        };

        net = findInContext(this.keywords.net);
        brut = findInContext(this.keywords.brut);

        // Güvenlik: Brüt her zaman >= Net olmalı
        if (brut > 0 && net > 0 && net > brut) {
            [brut, net] = [net, brut];
        }

        // Fallback: Sadece Net varsa tahmini Brüt hesapla (x1.2)
        if (net > 0 && brut === 0) {
            brut = Math.round(net * 1.2);
            isTahmin = true;
        }

        return { brut, net, isTahmin };
    }
};
