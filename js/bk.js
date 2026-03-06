// =============================================
// Smart BK Permission - BK Dashboard Logic
// =============================================

const BK_CREDENTIALS = { username: 'GuruBK', password: 'BKsmada' };
let allIzinData = [];
let currentDetailId = null;
let clockInterval = null;

// ---- Login ----
function doLogin(event) {
    event.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');

    if (user === BK_CREDENTIALS.username && pass === BK_CREDENTIALS.password) {
        errEl.style.display = 'none';
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        sessionStorage.setItem('bk_auth', '1');
        initDashboard();
    } else {
        errEl.style.display = 'flex';
        document.getElementById('loginPass').value = '';
        document.getElementById('loginPass').focus();
    }
}

function doLogout() {
    sessionStorage.removeItem('bk_auth');
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    if (clockInterval) clearInterval(clockInterval);
}

function togglePassword() {
    const input = document.getElementById('loginPass');
    const icon = document.getElementById('eyeIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// ---- Dashboard Init ----
function initDashboard() {
    startClock();
    loadAllData();

    // Auto-refresh setiap 30 detik
    window._refreshInterval = setInterval(loadAllData, 30000);
}

function startClock() {
    function tick() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
        const el = document.getElementById('topbarTime');
        if (el) el.textContent = `${dateStr}, ${timeStr}`;
    }
    tick();
    clockInterval = setInterval(tick, 1000);
}

async function loadAllData() {
    if (!window._supabase) {
        setTimeout(loadAllData, 500);
        return;
    }

    try {
        allIzinData = await getAllIzin();
        renderOverview();
        renderTable();
        renderHistory();
        updatePendingBadge();
    } catch (e) {
        console.error('Load data error:', e);
        showToast('Gagal memuat data terbaru', 'error');
    }
}

function refreshDashboard() {
    showToast('Memperbarui data...', 'info');
    loadAllData();
}

// ---- Tab Switcher ----
function showDashTab(tabName, el) {
    document.querySelectorAll('[id^="dashtab-"]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`dashtab-${tabName}`)?.classList.add('active');
    if (el) el.classList.add('active');

    const titles = {
        overview: { title: 'Overview Dashboard', sub: 'Ringkasan data pengajuan izin siswa' },
        pengajuan: { title: 'Pengajuan Masuk', sub: 'Kelola semua pengajuan izin siswa' },
        history: { title: 'Riwayat Keputusan', sub: 'Semua izin yang telah diproses' }
    };
    if (titles[tabName]) {
        document.getElementById('bkPageTitle').textContent = titles[tabName].title;
        document.getElementById('bkPageSub').textContent = titles[tabName].sub;
    }
    return false;
}

// ---- Overview ----
function renderOverview() {
    const total    = allIzinData.length;
    const menunggu = allIzinData.filter(x => x.status === 'menunggu').length;
    const disetujui= allIzinData.filter(x => x.status === 'disetujui').length;
    const ditolak  = allIzinData.filter(x => x.status === 'ditolak').length;
    const aiWarn   = allIzinData.filter(x => x.ai_warning).length;

    animNum('ov-total',     total);
    animNum('ov-menunggu',  menunggu);
    animNum('ov-disetujui', disetujui);
    animNum('ov-ditolak',   ditolak);
    animNum('ov-aiwarning', aiWarn);

    // Recent list (5 terbaru)
    const recent = allIzinData.slice(0, 5);
    const recentEl = document.getElementById('recentList');
    if (recent.length === 0) {
        recentEl.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fas fa-inbox"></i><p>Belum ada pengajuan</p></div>`;
    } else {
        recentEl.innerHTML = recent.map(item => `
            <div class="recent-item">
                <div class="recent-avatar">${getInitial(item.nama_siswa)}</div>
                <div class="recent-info">
                    <div class="recent-name">${escHtml(item.nama_siswa)}</div>
                    <div class="recent-detail">${escHtml(item.kelas)} • ${formatDateShort(item.created_at)}</div>
                </div>
                <span class="recent-status ${item.status}">${capitalize(item.status)}</span>
            </div>`).join('');
    }

    // AI Alert list
    const aiAlerts = allIzinData.filter(x => x.ai_warning && x.status === 'menunggu').slice(0, 4);
    const aiEl = document.getElementById('aiAlertList');
    if (aiAlerts.length === 0) {
        aiEl.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>Tidak ada peringatan AI saat ini</p></div>`;
    } else {
        aiEl.innerHTML = aiAlerts.map(item => `
            <div class="ai-alert-item">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <div class="ai-alert-name">${escHtml(item.nama_siswa)} — ${escHtml(item.kelas)}</div>
                    <div class="ai-alert-reason">${escHtml(item.hasil_ai)}</div>
                </div>
            </div>`).join('');
    }
}

function animNum(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    let start = current;
    const step = Math.ceil(Math.abs(target - start) / 20);
    const dir = target > start ? 1 : -1;
    const interval = setInterval(() => {
        start += dir * step;
        if ((dir > 0 && start >= target) || (dir < 0 && start <= target)) {
            start = target;
            clearInterval(interval);
        }
        el.textContent = start;
    }, 30);
}

// ---- Table: Pengajuan ----
function renderTable(data = null) {
    const list = data ?? allIzinData;
    const tbody = document.getElementById('bkTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty"><i class="fas fa-inbox"></i> Belum ada pengajuan izin</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((item, idx) => {
        const aiClass = item.ai_warning ? 'ai-danger' : 'ai-ok';
        const aiText  = item.ai_warning ? '⚠ Peringatan' : '✅ Normal';
        const isProcessed = item.status !== 'menunggu';

        return `
        <tr>
            <td><span style="color:var(--gray-400);font-weight:600">${idx + 1}</span></td>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:34px;height:34px;background:linear-gradient(135deg,var(--primary),var(--purple));border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;flex-shrink:0">
                        ${getInitial(item.nama_siswa)}
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:13px">${escHtml(item.nama_siswa)}</div>
                    </div>
                </div>
            </td>
            <td><span style="font-weight:500">${escHtml(item.kelas)}</span></td>
            <td>
                <div style="font-size:12px">
                    <div style="font-weight:500">${escHtml(item.guru_mapel)}</div>
                    <div style="color:var(--gray-400)">${escHtml(item.jam_pelajaran)}</div>
                </div>
            </td>
            <td>
                <div style="max-width:180px;font-size:12px;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(item.alasan)}">
                    ${escHtml(item.alasan)}
                </div>
            </td>
            <td><span style="font-weight:600;color:${item.durasi > 20 ? 'var(--danger)' : 'var(--gray-700)'}">${item.durasi} mnt</span></td>
            <td><span class="badge ${aiClass}">${aiText}</span></td>
            <td><span class="badge ${item.status}">${capitalize(item.status)}</span></td>
            <td><span style="font-size:11px;color:var(--gray-400)">${formatDateShort(item.created_at)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-detail" onclick="showDetail('${item.id}')" title="Detail">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${!isProcessed ? `
                        <button class="btn-acc" onclick="processIzin('${item.id}', 'disetujui')">
                            <i class="fas fa-check"></i> ACC
                        </button>
                        <button class="btn-tolak" onclick="processIzin('${item.id}', 'ditolak')">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    ` : `<span style="font-size:11px;color:var(--gray-400);font-style:italic">Selesai</span>`}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ---- Table: History ----
function renderHistory(data = null) {
    const list = (data ?? allIzinData).filter(x => x.status !== 'menunggu');
    const tbody = document.getElementById('histTableBody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><i class="fas fa-history"></i> Belum ada riwayat keputusan</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map((item, idx) => {
        const aiClass = item.ai_warning ? 'ai-danger' : 'ai-ok';
        const aiText  = item.ai_warning ? '⚠' : '✅';
        return `
        <tr>
            <td style="color:var(--gray-400);font-weight:600">${idx + 1}</td>
            <td>
                <div style="font-weight:600;font-size:13px">${escHtml(item.nama_siswa)}</div>
            </td>
            <td>${escHtml(item.kelas)}</td>
            <td>
                <div style="max-width:160px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(item.alasan)}">
                    ${escHtml(item.alasan)}
                </div>
            </td>
            <td style="font-weight:600;color:${item.durasi > 20 ? 'var(--danger)' : 'var(--gray-700)'}">${item.durasi} mnt</td>
            <td><span class="badge ${aiClass}" title="${escHtml(item.hasil_ai)}">${aiText}</span></td>
            <td><span class="badge ${item.status}">${capitalize(item.status)}</span></td>
            <td style="font-size:12px;color:var(--gray-500);max-width:140px">
                ${item.catatan_bk ? escHtml(item.catatan_bk) : '<span style="opacity:.4">—</span>'}
            </td>
            <td style="font-size:11px;color:var(--gray-400)">${formatDateShort(item.updated_at || item.created_at)}</td>
        </tr>`;
    }).join('');
}

// ---- Filter BK Table ----
function filterBK() {
    const search   = document.getElementById('bkSearch').value.toLowerCase();
    const status   = document.getElementById('bkFilterStatus').value;
    const aiFilter = document.getElementById('bkFilterAI').value;

    let filtered = allIzinData.filter(item => {
        const matchSearch = !search ||
            item.nama_siswa?.toLowerCase().includes(search) ||
            item.kelas?.toLowerCase().includes(search) ||
            item.alasan?.toLowerCase().includes(search);
        const matchStatus = !status || item.status === status;
        const matchAI = !aiFilter ||
            (aiFilter === 'warning' && item.ai_warning) ||
            (aiFilter === 'ok' && !item.ai_warning);
        return matchSearch && matchStatus && matchAI;
    });
    renderTable(filtered);
}

function filterHistory() {
    const search = document.getElementById('histSearch').value.toLowerCase();
    const status = document.getElementById('histFilterStatus').value;

    let filtered = allIzinData
        .filter(x => x.status !== 'menunggu')
        .filter(item => {
            const matchSearch = !search ||
                item.nama_siswa?.toLowerCase().includes(search) ||
                item.alasan?.toLowerCase().includes(search);
            const matchStatus = !status || item.status === status;
            return matchSearch && matchStatus;
        });
    renderHistory(filtered);
}

// ---- Detail Modal ----
function showDetail(id) {
    const item = allIzinData.find(x => x.id === id);
    if (!item) return;
    currentDetailId = id;

    const aiClass = item.ai_warning ? 'ai-danger' : 'ai-ok';
    const aiText  = item.ai_warning ? '⚠ Ada Peringatan' : '✅ Pengajuan Normal';

    document.getElementById('detailContent').innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <span class="detail-label">Nama Siswa</span>
                <span class="detail-value" style="font-weight:700">${escHtml(item.nama_siswa)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Kelas</span>
                <span class="detail-value">${escHtml(item.kelas)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Guru Mata Pelajaran</span>
                <span class="detail-value">${escHtml(item.guru_mapel)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Jam Pelajaran</span>
                <span class="detail-value">${escHtml(item.jam_pelajaran)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Durasi Izin</span>
                <span class="detail-value" style="color:${item.durasi > 20 ? 'var(--danger)' : 'inherit'};font-weight:700">
                    ${item.durasi} menit ${item.durasi > 20 ? '⚠' : ''}
                </span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Waktu Pengajuan</span>
                <span class="detail-value">${formatDate(item.created_at)}</span>
            </div>
            <div class="detail-item detail-full">
                <span class="detail-label">Alasan Izin</span>
                <span class="detail-value" style="line-height:1.6">${escHtml(item.alasan)}</span>
            </div>
            <div class="detail-item detail-full">
                <span class="detail-label">Status Saat Ini</span>
                <span class="badge ${item.status}" style="margin-top:4px">${capitalize(item.status)}</span>
            </div>
        </div>
        <div class="ai-analysis-box">
            <div class="ai-analysis-title">
                <i class="fas fa-robot"></i>
                Hasil Analisis AI
            </div>
            <span class="badge ${aiClass}" style="margin-bottom:8px;display:inline-flex">${aiText}</span>
            <div style="font-size:13px;color:var(--gray-600);line-height:1.7;margin-top:8px">
                ${escHtml(item.hasil_ai) || 'Tidak ada data analisis'}
            </div>
        </div>`;

    // Isi catatan BK existing
    document.getElementById('catatanBK').value = item.catatan_bk || '';

    // Tombol aksi
    const actionsEl = document.getElementById('modalActions');
    if (item.status === 'menunggu') {
        actionsEl.innerHTML = `
            <button class="btn-reset" onclick="closeModal('detailModal')">
                <i class="fas fa-times"></i> Tutup
            </button>
            <button class="btn-tolak" onclick="processFromModal('ditolak')">
                <i class="fas fa-times-circle"></i> Tolak Izin
            </button>
            <button class="btn-acc" onclick="processFromModal('disetujui')">
                <i class="fas fa-check-circle"></i> Setujui Izin
            </button>`;
    } else {
        actionsEl.innerHTML = `
            <button class="btn-submit" onclick="closeModal('detailModal')">
                <i class="fas fa-check"></i> Tutup
            </button>`;
    }

    document.getElementById('detailModal').style.display = 'flex';
}

async function processFromModal(status) {
    if (!currentDetailId) return;
    const catatan = document.getElementById('catatanBK').value.trim();
    closeModal('detailModal');
    await processIzin(currentDetailId, status, catatan);
}

// ---- Process Izin (ACC / Tolak) ----
async function processIzin(id, status, catatan = '') {
    showLoading(status === 'disetujui' ? 'Menyetujui izin...' : 'Menolak izin...');
    try {
        await updateStatus(id, status, catatan);
        hideLoading();

        // Update local data
        const idx = allIzinData.findIndex(x => x.id === id);
        if (idx !== -1) {
            allIzinData[idx].status = status;
            allIzinData[idx].catatan_bk = catatan;
        }

        const msg = status === 'disetujui'
            ? '✅ Izin berhasil disetujui!'
            : '❌ Izin berhasil ditolak.';
        showToast(msg, status === 'disetujui' ? 'success' : 'warning');

        renderOverview();
        renderTable();
        renderHistory();
        updatePendingBadge();

    } catch (e) {
        hideLoading();
        console.error('Process error:', e);
        showToast('Gagal memproses izin. Coba lagi.', 'error');
    }
}

// ---- Pending Badge ----
function updatePendingBadge() {
    const pending = allIzinData.filter(x => x.status === 'menunggu').length;
    const badge = document.getElementById('bkPendingBadge');
    if (badge) {
        badge.textContent = pending;
        badge.style.display = pending > 0 ? 'flex' : 'none';
    }
}

// ---- Export CSV ----
function exportCSV() {
    const headers = ['Nama Siswa', 'Kelas', 'Guru Mapel', 'Jam Pelajaran', 'Alasan', 'Durasi (mnt)', 'Status', 'Analisis AI', 'Catatan BK', 'Waktu Pengajuan'];
    const rows = allIzinData.map(item => [
        item.nama_siswa, item.kelas, item.guru_mapel, item.jam_pelajaran,
        item.alasan, item.durasi, item.status, item.hasil_ai,
        item.catatan_bk || '', formatDate(item.created_at)
    ].map(v => `"${String(v || '').replace(/"/g, '""')}"`));

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-bk-${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('File CSV berhasil diexport!', 'success');
}

// ---- Helpers ----
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---- Auto-init ----
window.addEventListener('supabaseReady', () => {
    // Jika sudah login sebelumnya di sesi yang sama
    if (sessionStorage.getItem('bk_auth') === '1') {
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        initDashboard();
    }
});
