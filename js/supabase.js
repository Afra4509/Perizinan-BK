// =============================================
// Smart BK Permission - Supabase Client v2
// =============================================

const SUPABASE_URL = 'https://ksrlnupdpdrjuhwctjxc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5rj6jx1Lp9Uf7fGbYBrhdA_xV30jR5w';

(function loadSupabase() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.onload = () => {
        window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.dispatchEvent(new Event('supabaseReady'));
    };
    document.head.appendChild(script);
})();

// =============================================
// AI Analysis Engine (Rule-Based)
// =============================================
function analyzeAI(data) {
    const results = [];
    let hasWarning = false;

    if (data.alasan && data.alasan.trim().length < 10) {
        results.push({ type: 'danger', text: '⚠ Alasan Tidak Jelas (kurang dari 10 karakter)' });
        hasWarning = true;
    }
    if (parseInt(data.durasi) > 20) {
        results.push({ type: 'warning', text: `⏱ Durasi Terlalu Lama (${data.durasi} menit > 20 menit)` });
        hasWarning = true;
    }
    const weekCount = getWeeklyCount(data.nama_siswa);
    if (weekCount >= 3) {
        results.push({ type: 'danger', text: `🔁 Perlu Review BK (${weekCount + 1}x izin minggu ini)` });
        hasWarning = true;
    }
    if (results.length === 0) {
        results.push({ type: 'success', text: '✅ Pengajuan Normal — Tidak Ada Peringatan' });
    }

    return { tags: results, hasWarning, summary: results.map(r => r.text).join(' | ') };
}

function getWeeklyCount(namaSiswa) {
    const allData = JSON.parse(localStorage.getItem('bk_weekly_cache') || '[]');
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return allData.filter(item => {
        const itemDate = new Date(item.created_at);
        return item.nama_siswa?.toLowerCase() === namaSiswa?.toLowerCase() && itemDate >= weekStart;
    }).length;
}

async function updateWeeklyCache() {
    try {
        const db = window._supabase;
        if (!db) return;
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const { data } = await db.from('izin_keluar')
            .select('nama_siswa, created_at')
            .gte('created_at', weekStart.toISOString());
        if (data) localStorage.setItem('bk_weekly_cache', JSON.stringify(data));
    } catch (e) {}
}

// =============================================
// Database Operations
// =============================================

async function insertIzin(payload) {
    await updateWeeklyCache();
    const ai = analyzeAI(payload);
    const record = { ...payload, hasil_ai: ai.summary, ai_warning: ai.hasWarning, status: 'menunggu' };
    const { data, error } = await window._supabase
        .from('izin_keluar').insert([record]).select().single();
    if (error) throw error;
    return data;
}

async function getMyIzin(namaSiswa) {
    const { data, error } = await window._supabase
        .from('izin_keluar').select('*')
        .ilike('nama_siswa', `%${namaSiswa}%`)
        .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
}

async function getAllIzin() {
    const { data, error } = await window._supabase
        .from('izin_keluar').select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function updateStatus(id, status, catatanBK = '') {
    const { data, error } = await window._supabase
        .from('izin_keluar')
        .update({ status, catatan_bk: catatanBK || null, updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
    if (error) throw error;
    return data;
}

// =============================================
// FITUR BARU: Konfirmasi Kembali
// =============================================

/**
 * Upload foto bukti kembali ke Supabase Storage
 * @param {File} file - File gambar dari input
 * @param {string} izinId - ID pengajuan izin
 * @returns {string} URL publik foto
 */
async function uploadFotoKembali(file, izinId) {
    const ext = file.name.split('.').pop();
    const fileName = `${izinId}_${Date.now()}.${ext}`;
    const { data, error } = await window._supabase.storage
        .from('bukti-kembali')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;

    const { data: urlData } = window._supabase.storage
        .from('bukti-kembali')
        .getPublicUrl(fileName);
    return urlData.publicUrl;
}

/**
 * Simpan konfirmasi kembali (foto + lokasi) ke database
 * @param {string} id - ID pengajuan izin
 * @param {object} konfirmasiData - { fotoUrl, lat, lng, alamat }
 */
async function submitKonfirmasiKembali(id, konfirmasiData) {
    const updatePayload = {
        konfirmasi_kembali: true,
        waktu_kembali: new Date().toISOString(),
        status: 'kembali',
        updated_at: new Date().toISOString()
    };

    if (konfirmasiData.fotoUrl) updatePayload.foto_kembali_url = konfirmasiData.fotoUrl;
    if (konfirmasiData.lat)     updatePayload.lokasi_lat     = konfirmasiData.lat;
    if (konfirmasiData.lng)     updatePayload.lokasi_lng     = konfirmasiData.lng;
    if (konfirmasiData.alamat)  updatePayload.lokasi_alamat  = konfirmasiData.alamat;

    const { data, error } = await window._supabase
        .from('izin_keluar')
        .update(updatePayload)
        .eq('id', id)
        .select().single();
    if (error) throw error;
    return data;
}

async function getStats() {
    const { data, error } = await window._supabase
        .from('izin_stats').select('*').single();
    if (error) {
        const all = await getAllIzin();
        return {
            total_semua:      all.length,
            total_menunggu:   all.filter(x => x.status === 'menunggu').length,
            total_disetujui:  all.filter(x => x.status === 'disetujui').length,
            total_ditolak:    all.filter(x => x.status === 'ditolak').length,
            total_kembali:    all.filter(x => x.status === 'kembali').length,
            total_warning_ai: all.filter(x => x.ai_warning).length,
            total_konfirmasi: all.filter(x => x.konfirmasi_kembali).length
        };
    }
    return data;
}

// =============================================
// Utilities
// =============================================

function formatDate(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDateShort(isoString) {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

function getInitial(name) { return (name || '?').charAt(0).toUpperCase(); }

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i><span>${message}</span>`;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 4500);
}

function showLoading(text = 'Memproses...') {
    const el = document.getElementById('loadingOverlay');
    const t  = document.getElementById('loadingText');
    if (el) { el.style.display = 'flex'; if (t) t.textContent = text; }
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
}

function toggleSidebar() {
    document.querySelector('.sidebar')?.classList.toggle('open');
    document.getElementById('sidebarOverlay')?.classList.toggle('show');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
}
