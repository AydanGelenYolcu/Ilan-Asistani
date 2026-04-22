/**
 * DOMHelpers — DOM sorgu ve veri temizleme yardımcıları.
 * Tüm scraper'lar bu modülü kullanır.
 */
const DOMHelpers = {

    /**
     * Akıllı Sayı Temizleyici (Smart Sanitizer).
     * Türkçe ve İngilizce formatları otomatik algılar:
     *   - "10.750.000"  → 10750000  (TR binlik ayırıcı)
     *   - "120,5"       → 120.5     (TR ondalık virgül)
     *   - "120.5"       → 120.5     (EN ondalık nokta — ESKİ KOD BUNU 1205 YAPIYORDU!)
     *   - "10.750,50"   → 10750.50  (TR karma format)
     *   - "5.500"       → 5500      (TR binlik: 3 hane = binlik)
     *   - "85"          → 85
     * @param {*} val — Ham metin veya sayı
     * @returns {number}
     */
    clean(val) {
        if (!val) return 0;
        let s = String(val).trim();

        // "Bin", "Milyon" gibi ifadeleri sayıya çevir
        s = s.replace(/bin/gi, '000').replace(/milyon/gi, '000000');

        s = s.replace(/[^0-9.,]/g, ''); // Sadece rakam, virgül, nokta kalsın
        if (!s) return 0;

        const hasComma = s.includes(',');
        const hasDot = s.includes('.');

        if (hasComma && hasDot) {
            // Karma format: "10.750,50" veya "10,750.50"
            const lastComma = s.lastIndexOf(',');
            const lastDot = s.lastIndexOf('.');

            if (lastComma > lastDot) {
                // TR format: "10.750,50" → virgül ondalık
                s = s.replace(/\./g, '').replace(',', '.');
            } else {
                // EN format: "10,750.50" → nokta ondalık
                s = s.replace(/,/g, '');
            }
        } else if (hasComma) {
            // Sadece virgül var
            const parts = s.split(',');
            // Eğer virgülden sonra tam 3 hane varsa ve sayı 1000'den küçük değilse bu binlik olabilir
            // Ama TR'de genelde virgül ondalıktır (120,50)
            if (parts.length === 2 && parts[1].length <= 2) {
                s = s.replace(',', '.');
            } else {
                s = s.replace(/,/g, '');
            }
        } else if (hasDot) {
            // Sadece nokta var: "150.000" veya "150.50"
            const parts = s.split('.');
            const lastPart = parts[parts.length - 1];

            // Eğer birden fazla nokta varsa veya son hane 3 hane ise BU BİNLİKTİR.
            // Örn: "150.000" -> "150000"
            // Örn: "1.250" -> "1250"
            if (parts.length > 2 || lastPart.length === 3) {
                s = s.replace(/\./g, '');
            } else {
                // Örn: "150.5" -> "150.5" (ondalık olarak kalsın)
            }
        }

        const result = parseFloat(s) || 0;

        // Eğer sonuç çok küçükse (örn 150) ama orijinal metinde "bin" veya ".000" geçiyorsa düzelt
        // Bu, haritadaki "90 bin" gibi durumlar için emniyet kemeridir.
        if (result < 1000 && (val.toString().toLowerCase().includes('bin') || val.toString().includes('.000'))) {
            return result * 1000;
        }

        return result;
    },

    /**
     * URL'yi temizler (query parametrelerini ve hash'i atar).
     * @param {string} url 
     * @returns {string}
     */
    normalizeUrl(url) {
        if (!url) return '';
        try {
            const u = new URL(url);
            return u.origin + u.pathname;
        } catch (e) {
            return url.split('?')[0].split('#')[0];
        }
    },

    /**
     * Tek seferde tüm ilan bilgilerini HashMap'e atar (O(n) → O(1) erişim).
     * Eski yöntem: her getVal() çağrısı listeyi baştan sonra tarıyordu.
     * Yeni yöntem: bir kere tara, istediğin etiketi anında oku.
     * @param {string} selector — Liste seçicisi
     * @returns {Object<string, string>} — { "m² (Brüt)": "120", "Aidat": "5.500", ... }
     */
    scrapeAllInfo(selector = '.classifiedInfoList li') {
        const dataMap = {};
        const items = document.querySelectorAll(selector);

        for (const item of items) {
            const label = item.querySelector('strong')?.innerText?.trim().replace(/:$/, '') || '';
            const value = item.querySelector('span')?.innerText?.trim() || '';
            if (label && value && !label.includes('Tapu')) {
                dataMap[label] = value;
            }
        }
        return dataMap;
    },

    /**
     * HashMap'ten etiket bazlı değer çeker (fallback sıralı arama).
     * @param {Object} dataMap — scrapeAllInfo() sonucu
     * @param {string[]} keys — Aranacak etiket listesi (öncelik sırasıyla)
     * @returns {string}
     */
    getFromMap(dataMap, keys) {
        if (!Array.isArray(keys)) keys = [keys];
        for (const key of keys) {
            // Tam eşleşme
            if (dataMap[key]) return dataMap[key];
            // Whitespace toleransı: map'te "m² (Brüt) " gibi trailing space olabilir
            for (const mapKey of Object.keys(dataMap)) {
                if (mapKey.trim() === key.trim()) return dataMap[mapKey];
            }
        }
        return '0';
    },

    /**
     * Eski getVal — geriye uyumluluk için korundu.
     * Yeni kodlar scrapeAllInfo + getFromMap kullanmalı.
     */
    getVal(keys, selector = '.classifiedInfoList li') {
        if (!Array.isArray(keys)) keys = [keys];

        const items = document.querySelectorAll(selector);
        for (const item of items) {
            const lbl = item.querySelector('strong')?.innerText || '';
            if (lbl.includes('Tapu')) continue;

            for (const k of keys) {
                if (lbl.includes(k)) {
                    return item.querySelector('span')?.innerText?.trim() || '0';
                }
            }
        }
        return '0';
    },

    /**
     * Bir CSS seçicisinden metin döndürür.
     * @param {string} selector
     * @returns {string}
     */
    getText(selector) {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim() : '';
    },

    /**
     * İlan ana fotoğraf URL'sini döndürür (og:image veya ana resim).
     * @returns {string}
     */
    getImageUrl() {
        const metaImg = document.querySelector('meta[property="og:image"]');
        const mainImg = document.querySelector('.classifiedDetailMainPhoto img');
        return metaImg ? metaImg.content : (mainImg ? mainImg.src : '');
    }
};
