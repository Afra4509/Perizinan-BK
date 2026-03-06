// =============================================
// Smart BK Permission - BK Dashboard v2
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
    if (window._refreshInterval) clearInterval(window._refreshInterval);
}

function togglePassword() {
    const input = document.getElementById('loginPass');
    const icon  = document.getElementById('eyeIcon');
    input.type = input.type === 'password' ? 'text' : 'password';
    icon.className = input.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

// ---- Dashboard Init ----
function initDashboard() {
    startClock();
    loadAllData();
    window._refreshInterval = setInterval(loadAllData, 30000);
}

function startClock() {
    function tick() {
        const now = new Date();
        const el  = document.getElementById('topbarTime');
        if (el) el.textContent =
            `${now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' })}, ` +
            now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    tick();
    clockInterval = setInterval(tick, 1000);
}

async function loadAllData() {
    if (!window._supabase) { setTimeout(loadAllData, 500); return; }
    try {
        allIzinData = await getAllIzin();
        renderOverview();
        renderTable();
        renderHistory();
        updatePendingBadge();
    } catch (e) {
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
        overview:  { title: 'Overview Dashboard',    sub: 'Ringkasan data pengajuan izin siswa' },
        pengajuan: { title: 'Pengajuan Masuk',        sub: 'Kelola semua pengajuan izin siswa' },
        konfirmasi:{ title: 'Konfirmasi Kembali',     sub: 'Bukti foto & lokasi siswa yang sudah kembali' },
        history:   { title: 'Riwayat Keputusan',      sub: 'Semua izin yang telah diproses' }
    };
    if (titles[tabName]) {
        document.getElementById('bkPageTitle').textContent = titles[tabName].title;
        document.getElementById('bkPageSub').textContent   = titles[tabName].sub;
    }
    if (tabName === 'konfirmasi') renderKonfirmasiList();
    return false;
}

// ---- Overview ----
function renderOverview() {
    const total     = allIzinData.length;
    const menunggu  = allIzinData.filter(x => x.status === 'menunggu').length;
    const disetujui = allIzinData.filter(x => x.status === 'disetujui').length;
    const ditolak   = allIzinData.filter(x => x.status === 'ditolak').length;
    const kembali   = allIzinData.filter(x => x.status === 'kembali').length;
    const aiWarn    = allIzinData.filter(x => x.ai_warning).length;

    animNum('ov-total',     total);
    animNum('ov-menunggu',  menunggu);
    animNum('ov-disetujui', disetujui);
    animNum('ov-ditolak',   ditolak);
    animNum('ov-kembali',   kembali);
    animNum('ov-aiwarning', aiWarn);

    // Recent list
    const recentEl = document.getElementById('recentList');
    const recent = allIzinData.slice(0, 5);
    recentEl.innerHTML = recent.length === 0
        ? `<div class="empty-state" style="padding:24px"><i class="fas fa-inbox"></i><p>Belum ada pengajuan</p></div>`
        : recent.map(item => `
            <div class="recent-item">
                <div class="recent-avatar">${getInitial(item.nama_siswa)}</div>
                <div class="recent-info">
                    <div class="recent-name">${escHtml(item.nama_siswa)}</div>
                    <div class="recent-detail">${escHtml(item.kelas)} • ${formatDateShort(item.created_at)}</div>
                </div>
                <span class="recent-status ${item.status}">${capitalize(item.status)}</span>
            </div>`).join('');

    // AI alerts
    const aiEl = document.getElementById('aiAlertList');
    const aiAlerts = allIzinData.filter(x => x.ai_warning && x.status === 'menunggu').slice(0, 4);
    aiEl.innerHTML = aiAlerts.length === 0
        ? `<div class="empty-state" style="padding:24px"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>Tidak ada peringatan AI</p></div>`
        : aiAlerts.map(item => `
            <div class="ai-alert-item">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <div class="ai-alert-name">${escHtml(item.nama_siswa)} — ${escHtml(item.kelas)}</div>
                    <div class="ai-alert-reason">${escHtml(item.hasil_ai)}</div>
                </div>
            </div>`).join('');

    // Konfirmasi belum terkonfirmasi (disetujui tapi belum kembali)
    const belumKembali = allIzinData.filter(x => x.status === 'disetujui' && !x.konfirmasi_kembali);
    const konfEl = document.getElementById('belumKembaliList');
    if (konfEl) {
        konfEl.innerHTML = belumKembali.length === 0
            ? `<div class="empty-state" style="padding:20px"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>Semua siswa sudah kembali</p></div>`
            : belumKembali.map(item => `
                <div class="recent-item" style="border-left:3px solid var(--warning);padding-left:12px">
                    <div class="recent-avatar" style="background:linear-gradient(135deg,var(--warning),#fb923c)">${getInitial(item.nama_siswa)}</div>
                    <div class="recent-info">
                        <div class="recent-name">${escHtml(item.nama_siswa)}</div>
                        <div class="recent-detail">${escHtml(item.kelas)} • ${item.durasi} mnt • ${formatDateShort(item.created_at)}</div>
                    </div>
                    <span class="recent-status" style="color:var(--warning);font-size:11px">⏳ Belum Kembali</span>
                </div>`).join('');
    }
}

function animNum(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    let start = current;
    const dir = target > start ? 1 : -1;
    const step = Math.ceil(Math.abs(target - start) / 20);
    const iv = setInterval(() => {
        start += dir * step;
        if ((dir > 0 && start >= target) || (dir < 0 && start <= target)) { start = target; clearInterval(iv); }
        el.textContent = start;
    }, 30);
}

// ---- Table: Pengajuan ----
function renderTable(data = null) {
    const list  = data ?? allIzinData;
    const tbody = document.getElementById('bkTableBody');
    if (!tbody) return;
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="table-empty"><i class="fas fa-inbox"></i> Belum ada pengajuan</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map((item, idx) => {
        const aiClass    = item.ai_warning ? 'ai-danger' : 'ai-ok';
        const aiText     = item.ai_warning ? '⚠ Peringatan' : '✅ Normal';
        const isProcessed = item.status !== 'menunggu';
        const konfBadge  = item.konfirmasi_kembali
            ? `<span class="badge" style="background:#d1fae5;color:#065f46">🏫 Sudah Kembali</span>`
            : (item.status === 'disetujui'
                ? `<span class="badge" style="background:#fef3c7;color:#92400e">⏳ Belum Kembali</span>`
                : '');

        return `
        <tr>
            <td><span style="color:var(--gray-400);font-weight:600">${idx + 1}</span></td>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:34px;height:34px;background:linear-gradient(135deg,var(--primary),var(--purple));border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;flex-shrink:0">${getInitial(item.nama_siswa)}</div>
                    <div style="font-weight:600;font-size:13px">${escHtml(item.nama_siswa)}</div>
                </div>
            </td>
            <td style="font-weight:500">${escHtml(item.kelas)}</td>
            <td>
                <div style="font-size:12px">
                    <div style="font-weight:500">${escHtml(item.guru_mapel)}</div>
                    <div style="color:var(--gray-400)">${escHtml(item.jam_pelajaran)}</div>
                </div>
            </td>
            <td><div style="max-width:160px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(item.alasan)}">${escHtml(item.alasan)}</div></td>
            <td><span style="font-weight:600;color:${item.durasi > 20 ? 'var(--danger)' : 'var(--gray-700)'}">${item.durasi} mnt</span></td>
            <td><span class="badge ${aiClass}">${aiText}</span></td>
            <td><span class="badge ${item.status}">${capitalize(item.status)}</span></td>
            <td>${konfBadge}</td>
            <td><span style="font-size:11px;color:var(--gray-400)">${formatDateShort(item.created_at)}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-detail" onclick="showDetail('${item.id}')" title="Detail"><i class="fas fa-eye"></i></button>
                    ${!isProcessed ? `
                        <button class="btn-acc"   onclick="processIzin('${item.id}','disetujui')"><i class="fas fa-check"></i> ACC</button>
                        <button class="btn-tolak" onclick="processIzin('${item.id}','ditolak')"><i class="fas fa-times"></i> Tolak</button>
                    ` : `<span style="font-size:11px;color:var(--gray-400);font-style:italic">Selesai</span>`}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ---- Tab: Konfirmasi Kembali ----
function renderKonfirmasiList(data = null) {
    const list  = (data ?? allIzinData).filter(x => x.konfirmasi_kembali || x.status === 'kembali');
    const tbody = document.getElementById('konfTableBody');
    if (!tbody) return;
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fas fa-inbox"></i> Belum ada siswa yang konfirmasi kembali</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map((item, idx) => `
        <tr>
            <td style="color:var(--gray-400);font-weight:600">${idx + 1}</td>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="width:32px;height:32px;background:linear-gradient(135deg,var(--success),#059669);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:12px">${getInitial(item.nama_siswa)}</div>
                    <div>
                        <div style="font-weight:600;font-size:13px">${escHtml(item.nama_siswa)}</div>
                        <div style="font-size:11px;color:var(--gray-400)">${escHtml(item.kelas)}</div>
                    </div>
                </div>
            </td>
            <td style="font-size:12px;color:var(--gray-500)">${formatDate(item.waktu_kembali)}</td>
            <td>
                ${item.foto_kembali_url
                    ? `<a href="${item.foto_kembali_url}" target="_blank" class="btn-lihat-foto">
                           <i class="fas fa-image"></i> Lihat Foto
                       </a>`
                    : `<span style="color:var(--gray-300);font-size:12px">—</span>`}
            </td>
            <td>
                ${item.lokasi_lat && item.lokasi_lng
                    ? `<button class="btn-lihat-peta" onclick="showLokasiModal('${item.lokasi_lat}','${item.lokasi_lng}','${escHtml(item.lokasi_alamat || '')}','${escHtml(item.nama_siswa)}')">
                           <i class="fas fa-map-marker-alt"></i> Lihat Peta
                       </button>`
                    : `<span style="color:var(--gray-300);font-size:12px">—</span>`}
            </td>
            <td>
                <div style="max-width:200px;font-size:11px;color:var(--gray-500)">
                    ${item.lokasi_alamat ? escHtml(item.lokasi_alamat.substring(0, 80)) + '...' : '<span style="opacity:.4">Tidak ada data</span>'}
                </div>
            </td>
            <td>
                <button class="btn-detail" onclick="showDetail('${item.id}')" title="Detail Lengkap">
                    <i class="fas fa-eye"></i> Detail
                </button>
            </td>
        </tr>`).join('');
}

// ---- Modal Lokasi BK ----
function showLokasiModal(lat, lng, alamat, nama) {
    document.getElementById('lokasiModalTitle').textContent = `Lokasi: ${nama}`;
    document.getElementById('lokasiModalAlamat').textContent = alamat || `${lat}, ${lng}`;
    document.getElementById('lokasiModalMap').innerHTML = '';
    document.getElementById('lokasiModal').style.display = 'flex';

    // Load Leaflet
    function initBKMap() {
        const map = L.map('lokasiModalMap').setView([parseFloat(lat), parseFloat(lng)], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap', maxZoom: 19
        }).addTo(map);
        const icon = L.divIcon({
            html: `<div style="background:linear-gradient(135deg,#10b981,#059669);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(16,185,129,.5);border:3px solid white"><i class='fas fa-user' style='transform:rotate(45deg);color:white;font-size:14px'></i></div>`,
            iconSize: [36, 36], iconAnchor: [18, 36]
        });
        L.marker([parseFloat(lat), parseFloat(lng)], { icon })
            .addTo(map)
            .bindPopup(`<b>${nama}</b><br><small>${alamat}</small>`)
            .openPopup();
        setTimeout(() => map.invalidateSize(), 200);
    }

    if (!window.L) {
        if (!document.querySelector('link[href*="leaflet"]')) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(css);
        }
        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = initBKMap;
        document.head.appendChild(js);
    } else {
        initBKMap();
    }

    // Link Google Maps
    document.getElementById('btnGoogleMaps').href =
        `https://www.google.com/maps?q=${lat},${lng}`;
}

// ---- History ----
function renderHistory(data = null) {
    const list  = (data ?? allIzinData).filter(x => x.status !== 'menunggu');
    const tbody = document.getElementById('histTableBody');
    if (!tbody) return;
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty"><i class="fas fa-history"></i> Belum ada riwayat</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map((item, idx) => `
        <tr>
            <td style="color:var(--gray-400);font-weight:600">${idx + 1}</td>
            <td style="font-weight:600;font-size:13px">${escHtml(item.nama_siswa)}</td>
            <td>${escHtml(item.kelas)}</td>
            <td><div style="max-width:160px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(item.alasan)}">${escHtml(item.alasan)}</div></td>
            <td style="font-weight:600;color:${item.durasi > 20 ? 'var(--danger)' : 'var(--gray-700)'}">${item.durasi} mnt</td>
            <td><span class="badge ${item.ai_warning ? 'ai-danger' : 'ai-ok'}">${item.ai_warning ? '⚠' : '✅'}</span></td>
            <td><span class="badge ${item.status}">${capitalize(item.status)}</span></td>
            <td>
                ${item.konfirmasi_kembali
                    ? `<span class="badge" style="background:#d1fae5;color:#065f46">🏫 Sudah</span>`
                    : `<span style="color:var(--gray-300);font-size:12px">—</span>`}
            </td>
            <td style="font-size:12px;color:var(--gray-500);max-width:140px">${item.catatan_bk ? escHtml(item.catatan_bk) : '<span style="opacity:.4">—</span>'}</td>
            <td style="font-size:11px;color:var(--gray-400)">${formatDateShort(item.updated_at || item.created_at)}</td>
        </tr>`).join('');
}

// ---- Filter ----
function filterBK() {
    const search   = document.getElementById('bkSearch').value.toLowerCase();
    const status   = document.getElementById('bkFilterStatus').value;
    const aiFilter = document.getElementById('bkFilterAI').value;
    renderTable(allIzinData.filter(item => {
        const matchSearch  = !search || item.nama_siswa?.toLowerCase().includes(search) || item.kelas?.toLowerCase().includes(search);
        const matchStatus  = !status || item.status === status;
        const matchAI      = !aiFilter || (aiFilter === 'warning' && item.ai_warning) || (aiFilter === 'ok' && !item.ai_warning);
        return matchSearch && matchStatus && matchAI;
    }));
}

function filterHistory() {
    const search = document.getElementById('histSearch').value.toLowerCase();
    const status = document.getElementById('histFilterStatus').value;
    renderHistory(allIzinData.filter(x => x.status !== 'menunggu').filter(item => {
        return (!search || item.nama_siswa?.toLowerCase().includes(search))
            && (!status || item.status === status);
    }));
}

function filterKonfirmasi() {
    const search = document.getElementById('konfSearch').value.toLowerCase();
    renderKonfirmasiList(allIzinData.filter(x => (x.konfirmasi_kembali || x.status === 'kembali')
        && (!search || x.nama_siswa?.toLowerCase().includes(search))));
}

// ---- Detail Modal ----
function showDetail(id) {
    const item = allIzinData.find(x => x.id === id);
    if (!item) return;
    currentDetailId = id;

    const aiClass = item.ai_warning ? 'ai-danger' : 'ai-ok';
    const aiText  = item.ai_warning ? '⚠ Ada Peringatan' : '✅ Pengajuan Normal';

    let konfirmasiHtml = '';
    if (item.konfirmasi_kembali) {
        konfirmasiHtml = `
        <div style="margin-top:16px;background:linear-gradient(135deg,#d1fae5,#a7f3d0);border-radius:12px;padding:16px;border:1.5px solid rgba(16,185,129,.3)">
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#065f46;margin-bottom:12px">
                <i class="fas fa-check-double"></i> Konfirmasi Sudah Kembali
            </div>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Waktu Kembali</span>
                    <span class="detail-value">${formatDate(item.waktu_kembali)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Bukti Lokasi</span>
                    <span class="detail-value">
                        ${item.lokasi_lat ? `<button class="btn-lihat-peta" style="font-size:12px" onclick="showLokasiModal('${item.lokasi_lat}','${item.lokasi_lng}','${escHtml(item.lokasi_alamat||'')}','${escHtml(item.nama_siswa)}')"><i class='fas fa-map-marker-alt'></i> Lihat Peta</button>` : '—'}
                    </span>
                </div>
                ${item.foto_kembali_url ? `
                <div class="detail-item detail-full">
                    <span class="detail-label">Foto Bukti</span>
                    <a href="${item.foto_kembali_url}" target="_blank">
                        <img src="${item.foto_kembali_url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-top:6px;border:2px solid rgba(16,185,129,.3)">
                    </a>
                </div>` : ''}
                ${item.lokasi_alamat ? `
                <div class="detail-item detail-full">
                    <span class="detail-label">Alamat Lokasi</span>
                    <span class="detail-value" style="font-size:12px">${escHtml(item.lokasi_alamat)}</span>
                </div>` : ''}
            </div>
        </div>`;
    }

    document.getElementById('detailContent').innerHTML = `
        <div class="detail-grid">
            <div class="detail-item"><span class="detail-label">Nama Siswa</span><span class="detail-value" style="font-weight:700">${escHtml(item.nama_siswa)}</span></div>
            <div class="detail-item"><span class="detail-label">Kelas</span><span class="detail-value">${escHtml(item.kelas)}</span></div>
            <div class="detail-item"><span class="detail-label">Guru Mata Pelajaran</span><span class="detail-value">${escHtml(item.guru_mapel)}</span></div>
            <div class="detail-item"><span class="detail-label">Jam Pelajaran</span><span class="detail-value">${escHtml(item.jam_pelajaran)}</span></div>
            <div class="detail-item"><span class="detail-label">Durasi</span><span class="detail-value" style="color:${item.durasi>20?'var(--danger)':'inherit'};font-weight:700">${item.durasi} menit${item.durasi>20?' ⚠':''}</span></div>
            <div class="detail-item"><span class="detail-label">Waktu Pengajuan</span><span class="detail-value">${formatDate(item.created_at)}</span></div>
            <div class="detail-item detail-full"><span class="detail-label">Alasan</span><span class="detail-value">${escHtml(item.alasan)}</span></div>
            <div class="detail-item detail-full"><span class="detail-label">Status</span><span class="badge ${item.status}" style="margin-top:4px;display:inline-flex">${capitalize(item.status)}</span></div>
        </div>
        <div class="ai-analysis-box">
            <div class="ai-analysis-title"><i class="fas fa-robot"></i> Hasil Analisis AI</div>
            <span class="badge ${aiClass}" style="margin-bottom:8px;display:inline-flex">${aiText}</span>
            <div style="font-size:13px;color:var(--gray-600);line-height:1.7;margin-top:8px">${escHtml(item.hasil_ai)||'Tidak ada data'}</div>
        </div>
        ${konfirmasiHtml}`;

    document.getElementById('catatanBK').value = item.catatan_bk || '';

    const actionsEl = document.getElementById('modalActions');
    actionsEl.innerHTML = item.status === 'menunggu' ? `
        <button class="btn-reset" onclick="closeModal('detailModal')"><i class="fas fa-times"></i> Tutup</button>
        <button class="btn-tolak" onclick="processFromModal('ditolak')"><i class="fas fa-times-circle"></i> Tolak Izin</button>
        <button class="btn-acc"   onclick="processFromModal('disetujui')"><i class="fas fa-check-circle"></i> Setujui Izin</button>
    ` : `<button class="btn-submit" onclick="closeModal('detailModal')"><i class="fas fa-check"></i> Tutup</button>`;

    document.getElementById('detailModal').style.display = 'flex';
}

async function processFromModal(status) {
    if (!currentDetailId) return;
    const catatan = document.getElementById('catatanBK').value.trim();
    closeModal('detailModal');
    await processIzin(currentDetailId, status, catatan);
}

async function processIzin(id, status, catatan = '') {
    showLoading(status === 'disetujui' ? 'Menyetujui izin...' : 'Menolak izin...');
    try {
        await updateStatus(id, status, catatan);
        hideLoading();
        const idx = allIzinData.findIndex(x => x.id === id);
        if (idx !== -1) { allIzinData[idx].status = status; allIzinData[idx].catatan_bk = catatan; }
        showToast(status === 'disetujui' ? '✅ Izin berhasil disetujui!' : '❌ Izin berhasil ditolak.', status === 'disetujui' ? 'success' : 'warning');
        renderOverview(); renderTable(); renderHistory(); updatePendingBadge();
    } catch (e) {
        hideLoading();
        showToast('Gagal memproses izin. Coba lagi.', 'error');
    }
}

function updatePendingBadge() {
    const pending = allIzinData.filter(x => x.status === 'menunggu').length;
    const badge   = document.getElementById('bkPendingBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'flex' : 'none'; }

    // Badge tab konfirmasi
    const konfPending = allIzinData.filter(x => x.status === 'disetujui' && !x.konfirmasi_kembali).length;
    const konfBadge   = document.getElementById('bkKonfBadge');
    if (konfBadge) { konfBadge.textContent = konfPending; konfBadge.style.display = konfPending > 0 ? 'flex' : 'none'; }
}

function exportCSV() {
    const headers = ['Nama','Kelas','Guru','Jam','Alasan','Durasi','Status','AI','Catatan BK','Konfirmasi Kembali','Waktu Kembali','Foto URL','Lat','Lng','Alamat','Waktu Pengajuan'];
    const rows = allIzinData.map(item => [
        item.nama_siswa, item.kelas, item.guru_mapel, item.jam_pelajaran, item.alasan,
        item.durasi, item.status, item.hasil_ai, item.catatan_bk || '',
        item.konfirmasi_kembali ? 'Ya' : 'Tidak',
        item.waktu_kembali || '', item.foto_kembali_url || '',
        item.lokasi_lat || '', item.lokasi_lng || '', item.lokasi_alamat || '',
        formatDate(item.created_at)
    ].map(v => `"${String(v||'').replace(/"/g,'""')}"`));

    const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `smart-bk-${new Date().toLocaleDateString('id-ID').replace(/\//g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('File CSV berhasil diexport!', 'success');
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

window.addEventListener('supabaseReady', () => {
    if (sessionStorage.getItem('bk_auth') === '1') {
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('dashboard').style.display  = 'flex';
        initDashboard();
    }
});
