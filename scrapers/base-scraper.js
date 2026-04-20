/**
 * BaseScraper — Tüm site scraper'larının temel sınıfı (Strategy Pattern).
 *
 * Yeni bir site eklemek için:
 * 1. Bu sınıftan türet (extends)
 * 2. detect() ve scrape() metodlarını override et
 * 3. ScraperFactory'ye register et
 */
class BaseScraper {
    /**
     * @param {object} config
     * @param {string} config.name — Site kısa adı (örn. 'sahibinden')
     * @param {object} config.selectors — CSS seçicileri
     */
    constructor(config) {
        this.name = config.name;
        this.selectors = config.selectors;
    }

    /**
     * Bu scraper mevcut sayfa için uygun mu?
     * @returns {boolean}
     */
    detect() {
        throw new Error(`${this.name}: detect() metodu implemente edilmeli`);
    }

    /**
     * İlan verilerini sayfadan çeker.
     * @returns {Promise<object>}
     */
    async scrape() {
        throw new Error(`${this.name}: scrape() metodu implemente edilmeli`);
    }

    // ─── ORTAK YARDIMCI METODLAR ───

    /** Sayfa başlığını seçiciden alır */
    getTitle() {
        const el = document.querySelector(this.selectors.title);
        return el ? el.innerText.trim() : document.title;
    }

    /** Açıklama metnini döndürür */
    getDescription() {
        const el = document.querySelector(this.selectors.description);
        return el ? el.innerText : '';
    }

    /** Fiyatı temizleyerek döndürür */
    getPrice() {
        const el = document.querySelector(this.selectors.price);
        return el ? DOMHelpers.clean(el.innerText.trim()) : 0;
    }

    /** İlan fotoğrafını döndürür */
    getImageUrl() {
        return DOMHelpers.getImageUrl();
    }

    /**
     * Enjekte edilecek hedef elementi döndürür (varsa).
     * @returns {Element|null}
     */
    getInjectTarget() {
        if (!this.selectors.injectTarget) return null;
        return document.querySelector(this.selectors.injectTarget);
    }

    // ─── DURUM TESPİTİ ───

    /** Eşyalı/mobilyalı kontrolü */
    checkFurnished(title, descText) {
        const regex = /(?:e[şs]yal[ıi]|mob[iı]l?yal[ıi])/i;

        // 1. Başlık kontrolü
        if (regex.test(title)) return true;

        // 2. Açıklama kontrolü (olumsuz ifadeler hariç)
        if (descText) {
            const d = descText.toLocaleLowerCase('tr-TR');
            if (regex.test(d)) {
                if (!d.includes('eşyalı değil') &&
                    !d.includes('mobilyalı değil') &&
                    !d.includes('boş')) {
                    return true;
                }
            }
        }

        // 3. Özellikler listesi kontrolü (tiklenmiş maddeler)
        const featureSelector = this.selectors.features || '#classifiedProperties li.selected';
        const featureItems = document.querySelectorAll(featureSelector);
        for (const item of featureItems) {
            if (regex.test(item.innerText.trim())) return true;
        }

        return false;
    }

    /**
     * Satılık/Kiralık durum tespiti.
     * @param {string} checkString — Durum + Kategori + Başlık birleşimi
     * @returns {{ isSatilik: boolean, isKiralik: boolean }}
     */
    detectStatus(checkString) {
        return {
            isSatilik: /sat[ıi]l[ıi]k/i.test(checkString),
            isKiralik: /kiral[ıi]k/i.test(checkString)
        };
    }
}
