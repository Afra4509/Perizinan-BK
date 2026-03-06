// =============================================
// Smart BK Permission - Siswa Logic v2
// =============================================

let allMyIzin = [];
let currentKonfirmasiId = null;
let capturedLocation = null;
let selectedFotoFile = null;
let mapInstance = null;
let mapMarker = null;

// ---- Tab Switcher ----
function showTab(tabName, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
    if (el) el.classList.add('active');
    const titles = {
        form:   { title: 'Ajukan Izin Keluar Kelas',   sub: 'Isi formulir dengan lengkap dan jelas' },
        status: { title: 'Status Pengajuan Izin',       sub: 'Pantau status & konfirmasi kembali' }
    };
    document.getElementById('pageTitle').textContent = titles[tabName].title;
    document.getElementById('pageSub').textContent   = titles[tabName].sub;
    if (tabName === 'status') loadMyStatus();
    return false;
}

// ---- Form Helpers ----
function updateCharCount(el) {
    const count = el.value.length;
    document.getElementById('charCount').textContent = count;
    document.getElementById('charWarning').style.display = (count > 0 && count < 10) ? 'inline-flex' : 'none';
    updateAIPreview();
}

function checkDurasi(el) {
    document.getElementById('durasiWarning').style.display = parseInt(el.value) > 20 ? 'flex' : 'none';
    updateAIPreview();
}

function updateAIPreview() {
    const alasan = document.getElementById('alasan')?.value || '';
    const durasi = document.getElementById('durasi')?.value || '';
    const nama   = document.getElementById('namaSiswa')?.value || '';
    if (!alasan && !durasi) { document.getElementById('aiPreview').style.display = 'none'; return; }
    const preview = analyzeAI({ alasan, durasi: parseInt(durasi), nama_siswa: nama });
    document.getElementById('aiPreviewContent').innerHTML =
        preview.tags.map(tag => `<span class="ai-tag ${tag.type}">${tag.text}</span>`).join('');
    document.getElementById('aiPreview').style.display = 'block';
}

// ---- Submit Form ----
async function submitIzin(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSubmit');
    const formData = {
        nama_siswa:    document.getElementById('namaSiswa').value.trim(),
        kelas:         document.getElementById('kelas').value,
        guru_mapel:    document.getElementById('guruMapel').value.trim(),
        jam_pelajaran: document.getElementById('jamPelajaran').value,
        alasan:        document.getElementById('alasan').value.trim(),
        durasi:        parseInt(document.getElementById('durasi').value)
    };
    if (formData.alasan.length < 10) {
        showToast('Alasan izin harus minimal 10 karakter!', 'error');
        document.getElementById('alasan').focus();
        return;
    }
    if (!window._supabase) { showToast('Koneksi sedang disiapkan, coba lagi...', 'warning'); return; }
    btn.disabled = true;
    showLoading('Mengirim pengajuan izin...');
    try {
        await insertIzin(formData);
        hideLoading();
        showToast('Pengajuan izin berhasil dikirim! 🎉', 'success');
        localStorage.setItem('lastNama', formData.nama_siswa);
        resetForm();
        setTimeout(() => showTab('status', document.querySelectorAll('.nav-item')[1]), 1500);
    } catch (e) {
        hideLoading();
        showToast('Gagal mengirim. Periksa koneksi internet.', 'error');
    } finally {
        btn.disabled = false;
    }
}

function resetForm() {
    document.getElementById('formIzin').reset();
    document.getElementById('charCount').textContent = '0';
    document.getElementById('charWarning').style.display  = 'none';
    document.getElementById('durasiWarning').style.display = 'none';
    document.getElementById('aiPreview').style.display     = 'none';
}

// ---- Load Status ----
async function loadMyStatus() {
    if (!window._supabase) { setTimeout(loadMyStatus, 500); return; }
    const searchVal = document.getElementById('searchNama')?.value.trim()
                   || localStorage.getItem('lastNama') || '';
    if (searchVal && document.getElementById('searchNama')) {
        document.getElementById('searchNama').value = searchVal;
    }
    if (!searchVal) {
        document.getElementById('statusList').innerHTML = `
            <div class="empty-state"><i class="fas fa-search"></i>
            <p>Masukkan nama lengkap Anda di kolom pencarian</p></div>`;
        return;
    }
    document.getElementById('statusList').innerHTML = `
        <div class="empty-state"><i class="fas fa-spinner fa-spin"></i>
        <p>Memuat data...</p></div>`;
    try {
        allMyIzin = await getMyIzin(searchVal);
        renderStatusList(allMyIzin);
        const pending = allMyIzin.filter(x => x.status === 'menunggu').length;
        const badge = document.getElementById('pendingBadge');
        if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? 'flex' : 'none'; }
    } catch (e) {
        document.getElementById('statusList').innerHTML = `
            <div class="empty-state"><i class="fas fa-exclamation-triangle"></i>
            <p>Gagal memuat data.</p></div>`;
    }
}

function filterStatus() {
    const nama   = document.getElementById('searchNama').value.trim();
    const status = document.getElementById('filterStatus').value;
    if (nama) {
        let d = allMyIzin;
        if (status) d = d.filter(x => x.status === status);
        renderStatusList(d);
        if (allMyIzin.length === 0) loadMyStatusFiltered(nama, status);
    } else {
        let d = allMyIzin;
        if (status) d = d.filter(x => x.status === status);
        renderStatusList(d);
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

// ---- Render Status List ----
function renderStatusList(list) {
    const container = document.getElementById('statusList');
    if (!list || list.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>Belum ada pengajuan izin</p></div>`;
        return;
    }
    container.innerHTML = list.map(item => buildStatusCard(item)).join('');
}

function buildStatusCard(item) {
    const statusIcon = { menunggu: '⏳', disetujui: '✅', ditolak: '❌', kembali: '🏫' }[item.status] || '❓';
    const aiClass    = item.ai_warning ? 'warning' : 'ok';
    const aiText     = item.ai_warning ? '⚠ Perlu Perhatian' : '✅ Normal';

    // Tombol konfirmasi kembali: hanya muncul jika status disetujui & belum konfirmasi
    const showKonfirmBtn = item.status === 'disetujui' && !item.konfirmasi_kembali;
    // Badge sudah kembali
    const sudahKembali   = item.konfirmasi_kembali || item.status === 'kembali';

    return `
    <div class="status-card" id="card-${item.id}">
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
                <span class="status-detail-label">Jam Pelajaran</span>
                <span class="status-detail-value">${escHtml(item.jam_pelajaran)}</span>
            </div>
            <div class="status-detail-item">
                <span class="status-detail-label">Durasi</span>
                <span class="status-detail-value">${item.durasi} menit</span>
            </div>
            <div class="status-detail-item">
                <span class="status-detail-label">Waktu Pengajuan</span>
                <span class="status-detail-value">${formatDate(item.created_at)}</span>
            </div>
            <div class="status-detail-item" style="grid-column:1/-1">
                <span class="status-detail-label">Alasan</span>
                <span class="status-detail-value">${escHtml(item.alasan)}</span>
            </div>
        </div>

        <div class="status-card-footer">
            <span class="ai-result-pill ${aiClass}"><i class="fas fa-robot"></i> ${aiText}</span>
            ${item.catatan_bk ? `
                <div class="catatan-bk-note">
                    <i class="fas fa-comment-alt"></i>
                    <strong>Catatan BK:</strong> ${escHtml(item.catatan_bk)}
                </div>` : ''}
        </div>

        ${showKonfirmBtn ? `
        <div class="konfirmasi-banner">
            <div class="konfirmasi-banner-content">
                <div class="konfirmasi-icon-wrap">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div>
                    <div class="konfirmasi-title">Izin Anda Disetujui!</div>
                    <div class="konfirmasi-sub">Setelah kembali ke kelas, laporkan kehadiran Anda kepada Guru BK</div>
                </div>
            </div>
            <button class="btn-konfirmasi-kembali" onclick="openKonfirmasiModal('${item.id}', '${escHtml(item.nama_siswa)}')">
                <i class="fas fa-check-double"></i>
                Saya Sudah Kembali
            </button>
        </div>` : ''}

        ${sudahKembali && item.waktu_kembali ? `
        <div class="kembali-confirmed-bar">
            <i class="fas fa-check-circle"></i>
            <div>
                <strong>Sudah Kembali</strong> — Dikonfirmasi pada ${formatDate(item.waktu_kembali)}
                ${item.lokasi_alamat ? `<br><span style="font-size:11px;opacity:.8"><i class="fas fa-map-marker-alt"></i> ${escHtml(item.lokasi_alamat)}</span>` : ''}
            </div>
        </div>` : ''}
    </div>`;
}

// =============================================
// MODAL KONFIRMASI KEMBALI
// =============================================

function openKonfirmasiModal(izinId, namaSiswa) {
    currentKonfirmasiId = izinId;
    capturedLocation    = null;
    selectedFotoFile    = null;

    document.getElementById('konfNamaSiswa').textContent = namaSiswa;
    document.getElementById('fotoPreviewWrap').style.display  = 'none';
    document.getElementById('fotoPreview').src                = '';
    document.getElementById('inputFoto').value                = '';
    document.getElementById('lokasiResult').style.display     = 'none';
    document.getElementById('lokasiStatusText').textContent   = '';
    document.getElementById('mapContainer').style.display     = 'none';
    document.getElementById('btnSubmitKonfirmasi').disabled   = false;
    resetFotoUploadArea();

    // Destroy peta lama jika ada
    if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarker = null; }

    document.getElementById('konfirmasiModal').style.display = 'flex';
}

function closeKonfirmasiModal() {
    document.getElementById('konfirmasiModal').style.display = 'none';
    if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarker = null; }
    capturedLocation = null;
    selectedFotoFile = null;
    currentKonfirmasiId = null;
}

// ---- Foto Upload ----
function resetFotoUploadArea() {
    const dropArea = document.getElementById('fotoDropArea');
    if (dropArea) {
        dropArea.innerHTML = `
            <i class="fas fa-camera upload-icon"></i>
            <div class="upload-title">Upload Foto Bukti Kembali</div>
            <div class="upload-sub">Drag & drop atau klik untuk memilih foto</div>
            <div class="upload-hint">JPG, PNG, WEBP — Maks. 5MB</div>
            <input type="file" id="inputFoto" accept="image/*" capture="environment"
                onchange="handleFotoChange(this)" style="display:none">
            <button type="button" class="btn-upload-foto" onclick="document.getElementById('inputFoto').click()">
                <i class="fas fa-folder-open"></i> Pilih dari Galeri
            </button>`;
        setupDropzone(dropArea);
    }
}

function setupDropzone(area) {
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) processSelectedFile(file);
        else showToast('Hanya file gambar yang diizinkan', 'error');
    });
}

function handleFotoChange(input) {
    if (input.files && input.files[0]) processSelectedFile(input.files[0]);
}

function processSelectedFile(file) {
    if (file.size > 5 * 1024 * 1024) { showToast('Ukuran foto maksimal 5MB', 'error'); return; }
    selectedFotoFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('fotoPreview').src     = e.target.result;
        document.getElementById('fotoPreviewWrap').style.display = 'flex';
        document.getElementById('fotoDropArea').style.display    = 'none';
    };
    reader.readAsDataURL(file);
}

function removeFoto() {
    selectedFotoFile = null;
    document.getElementById('fotoPreview').src            = '';
    document.getElementById('fotoPreviewWrap').style.display = 'none';
    document.getElementById('fotoDropArea').style.display    = 'block';
    document.getElementById('inputFoto').value               = '';
}

// ---- Ambil Lokasi GPS ----
async function ambilLokasi() {
    const btn    = document.getElementById('btnAmbilLokasi');
    const result = document.getElementById('lokasiResult');
    const text   = document.getElementById('lokasiStatusText');

    if (!navigator.geolocation) {
        showToast('Browser tidak mendukung geolocation', 'error');
        return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengambil lokasi...';
    text.textContent = '';
    result.style.display = 'none';

    try {
        const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true, timeout: 15000, maximumAge: 0
            })
        );

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        capturedLocation = { lat, lng, accuracy: pos.coords.accuracy };

        // Reverse geocoding via API gratis (nominatim)
        let alamat = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        try {
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=id`,
                { headers: { 'User-Agent': 'SmartBKPermission/1.0' } }
            );
            const geo = await resp.json();
            alamat = geo.display_name || alamat;
            capturedLocation.alamat = alamat;
        } catch (geoErr) {
            capturedLocation.alamat = alamat;
        }

        text.textContent = alamat;
        result.style.display = 'flex';
        btn.innerHTML = '<i class="fas fa-check"></i> Lokasi Berhasil Diambil';
        btn.style.background = 'var(--success)';

        // Render peta Leaflet
        renderMap(lat, lng, alamat);
        showToast('Lokasi berhasil diambil! 📍', 'success');

    } catch (err) {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Ambil Lokasi Saya';
        btn.style.background = '';
        const errMsg = {
            1: 'Akses lokasi ditolak. Izinkan akses lokasi di browser Anda.',
            2: 'Lokasi tidak tersedia. Pastikan GPS aktif.',
            3: 'Waktu habis. Coba lagi.'
        }[err.code] || 'Gagal mengambil lokasi.';
        showToast(errMsg, 'error');
    }
}

function renderMap(lat, lng, popup) {
    const mapDiv = document.getElementById('mapContainer');
    mapDiv.style.display = 'block';

    // Load Leaflet jika belum ada
    if (!window.L) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);

        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = () => initMap(lat, lng, popup);
        document.head.appendChild(js);
    } else {
        initMap(lat, lng, popup);
    }
}

function initMap(lat, lng, popup) {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }

    mapInstance = L.map('mapContainer', { zoomControl: true }).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(mapInstance);

    // Custom marker
    const icon = L.divIcon({
        html: `<div style="
            background:linear-gradient(135deg,#6366f1,#8b5cf6);
            width:36px;height:36px;border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);display:flex;align-items:center;
            justify-content:center;box-shadow:0 4px 12px rgba(99,102,241,.5);
            border:3px solid white">
            <i class='fas fa-user' style='transform:rotate(45deg);color:white;font-size:14px'></i>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });

    mapMarker = L.marker([lat, lng], { icon })
        .addTo(mapInstance)
        .bindPopup(`<b>Posisi Siswa</b><br><small>${popup}</small>`, { maxWidth: 250 })
        .openPopup();

    // Lingkaran akurasi
    if (capturedLocation?.accuracy) {
        L.circle([lat, lng], {
            radius: capturedLocation.accuracy,
            color: '#6366f1', fillColor: '#818cf8',
            fillOpacity: 0.12, weight: 2
        }).addTo(mapInstance);
    }

    setTimeout(() => mapInstance.invalidateSize(), 200);
}

// ---- Submit Konfirmasi ----
async function submitKonfirmasi() {
    // Minimal salah satu: foto ATAU lokasi
    if (!selectedFotoFile && !capturedLocation) {
        showToast('Harap upload foto ATAU ambil lokasi terlebih dahulu!', 'error');
        return;
    }

    const btn = document.getElementById('btnSubmitKonfirmasi');
    btn.disabled = true;
    showLoading('Mengirim konfirmasi kembali...');

    try {
        let fotoUrl = null;

        // Upload foto jika ada
        if (selectedFotoFile) {
            showLoading('Mengunggah foto bukti...');
            fotoUrl = await uploadFotoKembali(selectedFotoFile, currentKonfirmasiId);
        }

        // Simpan ke database
        showLoading('Menyimpan konfirmasi...');
        await submitKonfirmasiKembali(currentKonfirmasiId, {
            fotoUrl,
            lat:    capturedLocation?.lat    || null,
            lng:    capturedLocation?.lng    || null,
            alamat: capturedLocation?.alamat || null
        });

        hideLoading();
        closeKonfirmasiModal();
        showToast('Konfirmasi kembali berhasil dikirim! 🏫✅', 'success');

        // Refresh daftar status
        await loadMyStatus();

    } catch (e) {
        hideLoading();
        btn.disabled = false;
        console.error('Konfirmasi error:', e);
        showToast('Gagal mengirim konfirmasi. Coba lagi.', 'error');
    }
}

// ---- Helpers ----
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

window.addEventListener('supabaseReady', () => {
    const lastNama = localStorage.getItem('lastNama');
    if (lastNama && document.getElementById('searchNama')) {
        document.getElementById('searchNama').value = lastNama;
    }
});
