// ══════════════════════════════════════════════════════════════════════════════
// PAYLAŞILAN GLOBAL STATE
// Tüm modüller bu nesneyi okur/yazar.
// dashboard/core.js'den önce yüklenmelidir.
// ══════════════════════════════════════════════════════════════════════════════

const DashboardState = {
    currentProject: 'Varsayılan',
    currentSort: { column: null, direction: 'asc' },
    currentMoveLink: null,
    currentMoveTitle: null
};
