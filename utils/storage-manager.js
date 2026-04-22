/**
 * StorageManager — Promise-based Chrome Storage wrapper.
 * Tüm veri okuma/yazma işlemleri bu modül üzerinden yapılır.
 */
const StorageManager = {

    /**
     * chrome.storage.local.get'i Promise olarak döndürür.
     * @param {string|string[]} keys
     * @returns {Promise<object>}
     */
    get(keys) {
        return new Promise(resolve => chrome.storage.local.get(keys, resolve));
    },

    /**
     * chrome.storage.local.set'i Promise olarak döndürür.
     * @param {object} data
     * @returns {Promise<void>}
     */
    set(data) {
        return new Promise(resolve => chrome.storage.local.set(data, resolve));
    },

    /**
     * Tüm ilan listesini döndürür.
     * @returns {Promise<Array>}
     */
    async getListings() {
        const result = await this.get(['sahibindenListem']);
        return result.sahibindenListem || [];
    },

    /**
     * İlan listesini kaydeder.
     * @param {Array} list
     * @returns {Promise<void>}
     */
    async saveListings(list) {
        return this.set({ sahibindenListem: list });
    },

    /**
     * Yeni ilan ekler. Aynı projede duplicate varsa hata döner.
     * @param {object} item
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async addListing(item) {
        const list = await this.getListings();
        const project = (item.project || 'Varsayılan').trim();

        // Guard: Duplicate kontrolü (aynı link + aynı proje)
        const normalizedItemLink = DOMHelpers.normalizeUrl(item.Link);
        const isDuplicate = list.some(
            existing => DOMHelpers.normalizeUrl(existing.Link) === normalizedItemLink &&
                (existing.project || 'Varsayılan').trim() === project
        );
        if (isDuplicate) {
            return { success: false, message: '⚠️ Bu projede zaten var!' };
        }

        list.push(item);
        await this.saveListings(list);
        return { success: true, message: '✅ EKLENDİ!' };
    },

    /**
     * Mevcut ilan varsa günceller, yoksa ekler (Hızlı Ekle modu).
     * @param {object} item
     * @returns {Promise<{success: boolean, message: string, isUpdate: boolean}>}
     */
    async updateOrAddListing(item) {
        const list = await this.getListings();
        const project = (item.project || 'Varsayılan').trim();

        const normalizedItemLink = DOMHelpers.normalizeUrl(item.Link);
        const existingIndex = list.findIndex(
            existing => DOMHelpers.normalizeUrl(existing.Link) === normalizedItemLink &&
                (existing.project || 'Varsayılan').trim() === project
        );

        if (existingIndex !== -1) {
            const oldDurum = list[existingIndex].Durum;
            list[existingIndex] = { ...list[existingIndex], ...item };

            // Guard: Eski Durum spesifikse ve yeni 'Manuel' ise, eskiyi koru
            if (item.Durum === 'Manuel' && oldDurum && oldDurum !== 'Manuel') {
                list[existingIndex].Durum = oldDurum;
            }

            await this.saveListings(list);
            return { success: true, message: '🔄 Güncellendi!', isUpdate: true };
        }

        list.push(item);
        await this.saveListings(list);
        return { success: true, message: '✅ Eklendi!', isUpdate: false };
    }
};
