// ══════════════════════════════════════════════════════════════════════════════
// SAF YARDIMCI FONKSİYONLAR
// Bağımlılığı olmayan, birden fazla modülde kullanılan yardımcılar.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Sayıyı binlik nokta ayraçlı stringe çevirir.
 * Örn: 1234567 → "1.234.567"
 */
function formatMoney(val) {
    if (!val) return '0';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
