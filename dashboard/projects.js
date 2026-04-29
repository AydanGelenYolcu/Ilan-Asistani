// ══════════════════════════════════════════════════════════════════════════════
// PROJE YÖNETİMİ MODÜLÜ
// Proje tab'ları, CRUD işlemleri ve öğe taşıma.
// Bağımlılık: DashboardState, window.loadProjectsAndData
// ══════════════════════════════════════════════════════════════════════════════

const ProjectsModule = {

    renderTabs(projects, active, filter = '') {
        const container = document.getElementById('projectTabs');
        if (!container) return;

        const f = filter.toLocaleLowerCase('tr-TR');
        container.innerHTML = '';

        projects.forEach(p => {
            if (f && !p.toLocaleLowerCase('tr-TR').includes(f)) return;
            const btn = document.createElement('div');
            btn.className = `tab-btn ${p === active ? 'active' : ''}`;
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.gap = '8px';

            btn.onclick = () => {
                chrome.storage.local.set({ activeProject: p }, () => {
                    loadProjectsAndData();
                });
            };

            const span = document.createElement('span');
            span.innerText = p;
            btn.appendChild(span);

            // Çift tıklama ile yeniden adlandır (Varsayılan hariç)
            if (p !== 'Varsayılan') {
                btn.title = 'İsmi değiştirmek için çift tıkla';
                btn.ondblclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    ProjectsModule.renameProject(p);
                };
            }

            if (p !== 'Varsayılan') {
                const del = document.createElement('span');
                del.innerText = '✕';
                del.className = 'del-btn';
                del.title = 'Projeyi Sil';
                del.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`'${p}' projesi ve tüm verileri silinecek. Emin misiniz?`)) {
                        ProjectsModule.deleteProject(p);
                    }
                };
                btn.appendChild(del);
            }

            btn.ondragover = (e) => {
                e.preventDefault();
                btn.classList.add('drag-over');
            };
            btn.ondragleave = () => btn.classList.remove('drag-over');
            btn.ondrop = (e) => {
                e.preventDefault();
                btn.classList.remove('drag-over');
                const link = e.dataTransfer.getData('text/plain');
                if (link && p !== DashboardState.currentProject) {
                    if (confirm(`İlanı '${p}' projesine taşımak istiyor musunuz?`)) {
                        ProjectsModule.moveItem(link, p);
                    }
                }
            };

            container.appendChild(btn);
        });

        const addBtn = document.createElement('button');
        addBtn.innerText = '+';
        addBtn.className = 'tab-btn new-project-btn';
        addBtn.onclick = () => ProjectsModule.createNewProject();
        container.appendChild(addBtn);
    },

    deleteProject(projectName) {
        chrome.storage.local.get(['projectNames', 'sahibindenListem', 'activeProject', 'projectNotes', 'projectHistData'], (result) => {
            let projects = result.projectNames || ['Varsayılan'];
            let data = result.sahibindenListem || [];
            let active = result.activeProject || 'Varsayılan';
            const notes = result.projectNotes || {};
            const histData = result.projectHistData || {};

            projects = projects.filter(p => p !== projectName);
            data = data.filter(item => (item.project || 'Varsayılan') !== projectName);
            delete notes[projectName];
            delete histData[projectName];

            if (active === projectName) active = 'Varsayılan';

            chrome.storage.local.set({
                projectNames: projects,
                sahibindenListem: data,
                activeProject: active,
                projectNotes: notes,
                projectHistData: histData
            }, () => {
                loadProjectsAndData();
            });
        });
    },

    renameProject(oldName) {
        if (oldName === 'Varsayılan') {
            alert('Varsayılan projesi yeniden adlandırılamaz.');
            return;
        }

        const input = prompt(`'${oldName}' yeni adı:`, oldName);
        if (input === null) return;
        const newName = input.trim();

        if (!newName) { alert('Proje adı boş olamaz.'); return; }
        if (newName === oldName) return;
        if (newName === 'Varsayılan') { alert('"Varsayılan" rezerve bir isim, kullanılamaz.'); return; }

        chrome.storage.local.get(
            ['projectNames', 'sahibindenListem', 'activeProject', 'projectNotes', 'projectHistData'],
            (result) => {
                const projects = result.projectNames || ['Varsayılan'];
                if (projects.includes(newName)) { alert('Bu isimde proje zaten var!'); return; }

                // 1. projectNames listesinde yerinde değiştir (sıra korunur)
                const idx = projects.indexOf(oldName);
                if (idx === -1) { alert('Proje bulunamadı.'); return; }
                projects[idx] = newName;

                // 2. Tüm ilanların project alanını güncelle
                const data = (result.sahibindenListem || []).map(item => {
                    if ((item.project || 'Varsayılan') === oldName) {
                        return { ...item, project: newName };
                    }
                    return item;
                });

                // 3. Aktif proje eşleşiyorsa güncelle
                const active = result.activeProject === oldName ? newName : (result.activeProject || 'Varsayılan');

                // 4. Notlar ve hist verilerinin anahtarını taşı
                const notes = result.projectNotes || {};
                if (oldName in notes) { notes[newName] = notes[oldName]; delete notes[oldName]; }

                const histData = result.projectHistData || {};
                if (oldName in histData) { histData[newName] = histData[oldName]; delete histData[oldName]; }

                chrome.storage.local.set({
                    projectNames: projects,
                    sahibindenListem: data,
                    activeProject: active,
                    projectNotes: notes,
                    projectHistData: histData
                }, () => {
                    loadProjectsAndData();
                });
            }
        );
    },

    createNewProject() {
        const name = prompt('Yeni Proje Adı:');
        if (!name) return;

        chrome.storage.local.get(['projectNames'], (result) => {
            const list = result.projectNames || ['Varsayılan'];
            if (list.includes(name)) {
                alert('Bu isimde proje zaten var!');
                return;
            }
            list.push(name);
            chrome.storage.local.set({ projectNames: list, activeProject: name }, () => {
                loadProjectsAndData();
            });
        });
    },

    moveItem(link, targetProject) {
        chrome.storage.local.get(['sahibindenListem'], (result) => {
            let data = result.sahibindenListem || [];
            const index = data.findIndex(item =>
                item.Link === link && (item.project || 'Varsayılan') === DashboardState.currentProject
            );
            if (index !== -1) {
                data[index].project = targetProject;
                chrome.storage.local.set({ sahibindenListem: data }, () => {
                    loadProjectsAndData();
                });
            }
        });
    }
};

// Backward compat: eski çağrılar için global alias'lar
function renderTabs(projects, active, filter) { ProjectsModule.renderTabs(projects, active, filter); }
function deleteProject(projectName) { ProjectsModule.deleteProject(projectName); }
function renameProject(oldName) { ProjectsModule.renameProject(oldName); }
function createNewProject() { ProjectsModule.createNewProject(); }
function moveItem(link, targetProject) { ProjectsModule.moveItem(link, targetProject); }
