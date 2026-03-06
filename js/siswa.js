// =============================================
// Smart BK Permission - Siswa Logic
// =============================================

let allMyIzin = [];

// ---- Tab Switcher ----
function showTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    if (el) el.classList.add('active');

    const titles = {
        form: { title: 'Ajukan Izin Keluar Kelas', sub: 'Isi formulir dengan lengkap dan jelas' },
        status: { title: 'Status Pengajuan Izin', sub: 'Pantau status izin keluar kelas Anda' }
    };
    document.getElementById('pageTitle').textContent = titles[tabName].title;
    document.getElementById('pageSub').textContent = titles[tabName].sub;

    if (tabName === 'status') loadMyStatus();
    return false;
}

// ---- Form Helpers ----
function updateCharCount(el) {
    const count = el.value.length;
    document.getElementById('charCount').textContent = count;
    const warning = document.getElementById('charWarning');
    warning.style.display = count > 0 && count < 10 ? 'inline-flex' : 'none';
    updateAIPreview();
}

function checkDurasi(el) {
    const val = parseInt(el.value);
    const warning = document.getElementById('durasiWarning');
    warning.style.display = val > 20 ? 'flex' : 'none';
    updateAIPreview();
}

function updateAIPreview() {
    const alasan = document.getElementById('alasan')?.value || '';
    const durasi = document.getElementById('durasi')?.value || '';
    const nama = document.getElementById('namaSiswa')?.value || '';

    if (!alasan && !durasi) {
        document.getElementById('aiPreview').style.display = 'none';
        return;
    }

    const preview = analyzeAI({ alasan, durasi: parseInt(durasi), nama_siswa: nama });
    const previewBox = document.getElementById('aiPreview');
    const previewContent = document.getElementById('aiPreviewContent');

    previewContent.innerHTML = preview.tags.map(tag =>
        `<span class="ai-tag ${tag.type}">${tag.text}</span>`
    ).join('');

    previewBox.style.display = 'block';
}

// ---- Submit Form ----
async function submitIzin(event) {
    event.preventDefault();

    const btn = document.getElementById('btnSubmit');
    const formData = {
        nama_siswa: document.getElementById('namaSiswa').value.trim(),
        kelas: document.getElementById('kelas').value,
        guru_mapel: document.getElementById('guruMapel').value.trim(),
        jam_pelajaran: document.getElementById('jamPelajaran').value,
        alasan: document.getElementById('alasan').value.trim(),
        durasi: parseInt(document.getElementById('durasi').value)
    };

    // Validasi alasan
    if (formData.alasan.length < 10) {
        showToast('Alasan izin harus minimal 10 karakter!', 'error');
        document.getElementById('alasan').focus();
        return;
    }

    // Tunggu Supabase siap
    if (!window._supabase) {
        showToast('Koneksi ke database sedang disiapkan, coba lagi...', 'warning');
        return;
    }

    btn.disabled = true;
    showLoading('Mengirim pengajuan izin...');

    try {
        const result = await insertIzin(formData);

        hideLoading();
        showToast('Pengajuan izin berhasil dikirim! 🎉', 'success');

        // Simpan nama terakhir untuk tracking status
        localStorage.setItem('lastNama', formData.nama_siswa);

        // Reset form
        resetForm();

        // Otomatis pindah ke tab status setelah 1.5 detik
        setTimeout(() => {
            showTab('status', document.querySelectorAll('.nav-item')[1]);
        }, 1500);

    } catch (error) {
        hideLoading();
        console.error('Submit error:', error);
        showToast('Gagal mengirim pengajuan. Periksa koneksi internet Anda.', 'error');
    } finally {
        btn.disabled = false;
    }
}

function resetForm() {
    document.getElementById('formIzin').reset();
    document.getElementById('charCount').textContent = '0';
    document.getElementById('charWarning').style.display = 'none';
    document.getElementById('durasiWarning').style.display = 'none';
    document.getElementById('aiPreview').style.display = 'none';
}

// ---- Load Status ----
async function loadMyStatus() {
    if (!window._supabase) {
        setTimeout(loadMyStatus, 500);
        return;
    }

    const searchVal = document.getElementById('searchNama')?.value.trim()
        || localStorage.getItem('lastNama') || '';

    if (!searchVal) {
        document.getElementById('statusList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>Masukkan nama lengkap Anda di kolom pencarian untuk melihat status izin</p>
            </div>`;
        return;
    }

    document.getElementById('statusList').innerHTML = `
        <div class="empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Memuat data status...</p>
        </div>`;

    try {
        allMyIzin = await getMyIzin(searchVal);
        renderStatusList(allMyIzin);

        // Update pending badge
        const pending = allMyIzin.filter(x => x.status === 'menunggu').length;
        const badge = document.getElementById('pendingBadge');
        if (badge) {
            badge.textContent = pending;
            badge.style.display = pending > 0 ? 'flex' : 'none';
        }
    } catch (e) {
        document.getElementById('statusList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Gagal memuat data. Periksa koneksi internet.</p>
            </div>`;
    }
}

function filterStatus() {
    const searchVal = document.getElementById('searchNama').value.trim();
    const statusFilter = document.getElementById('filterStatus').value;

    if (searchVal) {
        loadMyStatusFiltered(searchVal, statusFilter);
    } else {
        let filtered = allMyIzin;
        if (statusFilter) filtered = filtered.filter(x => x.status === statusFilter);
        renderStatusList(filtered);
    }
}

async function loadMyStatusFiltered(nama, status) {
    try {
        let data = await getMyIzin(nama);
        if (status) data = data.filter(x => x.status === status);
        allMyIzin = data;
        renderStatusList(data);
    } catch (e) {}
}

function renderStatusList(list) {
    const container = document.getElementById('statusList');

    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>Belum ada pengajuan izin yang ditemukan</p>
            </div>`;
        return;
    }

    container.innerHTML = list.map(item => {
        const statusIcon = {
            menunggu: '⏳',
            disetujui: '✅',
            ditolak: '❌'
        }[item.status] || '❓';

        const aiClass = item.ai_warning ? 'warning' : 'ok';
        const aiText = item.ai_warning ? '⚠ Perlu Perhatian' : '✅ Normal';

        return `
        <div class="status-card">
            <div class="status-card-header">
                <div class="status-info">
                    <div class="status-avatar">${getInitial(item.nama_siswa)}</div>
                    <div>
                        <div class="status-name">${escHtml(item.nama_siswa)}</div>
                        <div class="status-meta">${escHtml(item.kelas)} • ${formatDateShort(item.created_at)}</div>
                    </div>
                </div>
                <span class="status-badge ${item.status}">${statusIcon} ${capitalize(item.status)}</span>
            </div>
            <div class="status-card-body">
                <div class="status-detail-item">
                    <span class="status-detail-label">Guru Mapel</span>
                    <span class="status-detail-value">${escHtml(item.guru_mapel)}</span>
                </div>
                <div class="status-detail-item">
                    
