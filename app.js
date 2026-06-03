// ============================================================
// XMLFlow — E-Publication Automation Tool
// app.js — Complete Application Logic
// ============================================================

// PDF.js worker (CDN so it works from file:// and http://)
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// ============================================================
// CONSTANTS
// ============================================================
const CONTENT_TYPES = [
  { id: 'title',      label: 'Title',      desc: 'Book or document title' },
  { id: 'heading',    label: 'Heading',    desc: 'Chapter or main section heading' },
  { id: 'subheading', label: 'Subheading', desc: 'Sub-section or minor heading' },
  { id: 'paragraph',  label: 'Paragraph',  desc: 'Regular body text' },
  { id: 'listitem',   label: 'List Item',  desc: 'Bulleted or numbered item' },
  { id: 'caption',    label: 'Caption',    desc: 'Image or figure caption' },
  { id: 'ignore',     label: 'Ignore',     desc: 'Skip this block in output' },
];

const DEFAULT_TAGS = {
  title:      'title',
  heading:    'h1',
  subheading: 'h2',
  paragraph:  'p',
  listitem:   'li',
  caption:    'caption',
};

// ============================================================
// APPLICATION STATE
// ============================================================
const App = {
  screen: 'home',
  profiles: [],
  activeProfileId: null,
  editingProfileId: null,

  project: {
    file: null,
    fileName: '',
    pageCount: 0,
    pdfDoc: null,
    pages: [],          // [{ pageNum, imageData, isDigital, blocks }]
    allBlocks: [],      // flat list of all classified blocks
    xmlOutput: '',
  },

  stats: { projects: 0, pages: 0, tags: 0 },
  isProcessing: false,
  cancelled: false,
  reviewPageNum: 1,
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadProfiles();
  loadStats();
  renderTagMappingBody();
  updateUI();
});

// ============================================================
// NAVIGATION
// ============================================================
function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-screen="${screen}"]`);
  if (nav) nav.classList.add('active');

  App.screen = screen;

  // Per-screen init
  if (screen === 'home')     updateHomeStats();
  if (screen === 'upload')   initUploadScreen();
  if (screen === 'profiles') renderProfilesScreen();
  if (screen === 'review')   initReviewScreen();
  if (screen === 'output')   renderOutputScreen();
}

// ============================================================
// PROFILE MANAGEMENT
// ============================================================
function loadProfiles() {
  try {
    const raw = localStorage.getItem('xmlflow_profiles');
    App.profiles = raw ? JSON.parse(raw) : [];
  } catch (e) {
    App.profiles = [];
  }
  if (App.profiles.length === 0) {
    App.profiles.push({
      id: 'default',
      name: 'Default Profile',
      createdAt: new Date().toISOString(),
      tags: {},
    });
    persistProfiles();
  }
  updateProfilesBadge();
}

function persistProfiles() {
  localStorage.setItem('xmlflow_profiles', JSON.stringify(App.profiles));
  updateProfilesBadge();
}

function updateProfilesBadge() {
  const b = document.getElementById('profiles-count');
  if (b) b.textContent = App.profiles.length;
  const s = document.getElementById('stat-profiles');
  if (s) s.textContent = App.profiles.length;
}

function showCreateProfileModal() {
  App.editingProfileId = null;
  document.getElementById('profile-modal-title').textContent = 'Create Client Profile';
  document.getElementById('new-profile-name').value = '';
  document.getElementById('tag-doc-status').textContent = '';
  resetTagMappingBody();
  openModal('create-profile-modal');
}

function editProfileModal(profileId) {
  const p = App.profiles.find(x => x.id === profileId);
  if (!p) return;
  App.editingProfileId = profileId;
  document.getElementById('profile-modal-title').textContent = 'Edit Profile';
  document.getElementById('new-profile-name').value = p.name;
  document.getElementById('tag-doc-status').textContent = '';
  populateTagMappingBody(p.tags);
  openModal('create-profile-modal');
}

function saveNewProfile() {
  const name = document.getElementById('new-profile-name').value.trim();
  if (!name) { toast('Please enter a profile name', 'error'); return; }

  const tags = collectTagMappings();

  if (App.editingProfileId) {
    const idx = App.profiles.findIndex(p => p.id === App.editingProfileId);
    if (idx !== -1) {
      App.profiles[idx].name = name;
      App.profiles[idx].tags = tags;
      App.profiles[idx].updatedAt = new Date().toISOString();
    }
    toast('Profile updated', 'success');
  } else {
    const profile = {
      id: 'p_' + Date.now(),
      name,
      createdAt: new Date().toISOString(),
      tags,
    };
    App.profiles.push(profile);
    App.activeProfileId = profile.id;
    toast('Profile created', 'success');
  }

  persistProfiles();
  closeModal('create-profile-modal');
  renderProfilesScreen();
  renderProfileGrid();
}

function deleteProfile(id) {
  if (App.profiles.length === 1) { toast('Cannot delete the only profile', 'error'); return; }
  if (!confirm('Delete this profile?')) return;
  App.profiles = App.profiles.filter(p => p.id !== id);
  if (App.activeProfileId === id) App.activeProfileId = null;
  persistProfiles();
  renderProfilesScreen();
  renderProfileGrid();
  toast('Profile deleted', 'success');
}

function selectProfileInList(id) {
  App.activeProfileId = id;
  document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('active-profile'));
  const c = document.querySelector(`[data-profile-id="${id}"]`);
  if (c) c.classList.add('active-profile');
  renderProfileEditor(id);
}

function selectUploadProfile(id) {
  App.activeProfileId = id;
  document.querySelectorAll('.profile-option').forEach(o => o.classList.remove('selected'));
  const o = document.querySelector(`[data-opt-profile="${id}"]`);
  if (o) o.classList.add('selected');
  checkProcessReady();
}

function exportProfile(id) {
  const p = App.profiles.find(x => x.id === id);
  if (!p) return;
  downloadText(JSON.stringify(p, null, 2), p.name.replace(/\s+/g, '_') + '_profile.json', 'application/json');
  toast('Profile exported', 'success');
}

function importProfile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const p = JSON.parse(e.target.result);
      if (!p.name || !p.tags) throw new Error('Invalid format');
      p.id = 'p_' + Date.now();
      p.createdAt = new Date().toISOString();
      App.profiles.push(p);
      persistProfiles();
      renderProfilesScreen();
      toast(`Imported "${p.name}"`, 'success');
    } catch {
      toast('Invalid profile file', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// PROFILES SCREEN RENDER
// ============================================================
function renderProfilesScreen() {
  const list = document.getElementById('profiles-list');
  if (!list) return;

  if (App.profiles.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:32px 16px"><div class="empty-title">No profiles yet</div><div class="empty-desc">Create your first client profile</div></div>';
    return;
  }

  list.innerHTML = App.profiles.map(p => `
    <div class="profile-card ${App.activeProfileId === p.id ? 'active-profile' : ''}"
         data-profile-id="${p.id}"
         onclick="selectProfileInList('${p.id}')">
      <div class="profile-card-name">${esc(p.name)}</div>
      <div class="profile-card-meta">${Object.keys(p.tags).length} mappings &bull; ${fmtDate(p.createdAt)}</div>
      <div class="profile-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editProfileModal('${p.id}')" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();exportProfile('${p.id}')" title="Export JSON">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        </button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteProfile('${p.id}')" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  if (App.activeProfileId) renderProfileEditor(App.activeProfileId);
}

function renderProfileEditor(id) {
  const p = App.profiles.find(x => x.id === id);
  if (!p) return;
  const title = document.getElementById('editor-title');
  if (title) title.textContent = p.name;
  const container = document.getElementById('profile-editor-container');
  if (!container) return;

  const allEntries = Object.entries(p.tags);

  container.innerHTML = `
    <div class="profile-editor">
      <div class="card-header" style="padding:14px 18px">
        <span class="card-title">Tag Mappings — ${esc(p.name)}</span>
        <div style="display:flex;gap:7px">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer" title="Upload tag document to auto-fill">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            Upload Tag Doc
            <input type="file" style="display:none" onchange="handleEditTagDoc(event,'${id}')">
          </label>
          <button class="btn btn-secondary btn-sm" onclick="addCustomTagRow('${id}')" title="Add tag row" style="padding:0 10px;font-size:18px;line-height:1">+</button>
          <button class="btn btn-primary btn-sm" onclick="saveEditorChanges('${id}')">Save</button>
        </div>
      </div>

      <!-- Upload result status bar -->
      <div id="upload-result-${id}" style="
        padding:10px 18px;
        font-size:12px;
        border-bottom:1px solid var(--border);
        background:var(--bg-card);
        min-height:38px;
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      ">
        <span style="color:var(--text-muted)">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:middle;margin-right:4px"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Upload a Word (.docx), Excel (.xlsx), or XML file to auto-fill, or click <strong style="color:var(--text-primary)">+</strong> to add tags manually.
        </span>
      </div>

      <table class="tag-table">
        <thead>
          <tr>
            <th>Label / Key</th>
            <th>XML Tag Name (no &lt; &gt;)</th>
          </tr>
        </thead>
        <tbody id="custom-tags-tbody-${id}">
          ${allEntries.length === 0
            ? `<tr id="empty-row-${id}"><td colspan="2" style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px">No tags yet — upload a document or click <strong style="color:var(--text-primary)">+</strong> to add manually.</td></tr>`
            : allEntries.map(([k, v]) => buildCustomTagRow(k, v)).join('')
          }
        </tbody>
      </table>
    </div>`;
}

function buildCustomTagRow(label, tagVal) {
  return `
    <tr class="custom-tag-row">
      <td>
        <input class="tag-input custom-label-input" placeholder="e.g. heading, box_text" value="${esc(label)}" style="width:100%">
      </td>
      <td style="display:flex;gap:6px;align-items:center">
        <input class="tag-input custom-tag-input" placeholder="e.g. h1, boxtext" value="${esc(tagVal)}" style="flex:1">
        <button onclick="this.closest('tr').remove()" title="Remove row"
                style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;line-height:1;padding:0 4px;flex-shrink:0">×</button>
      </td>
    </tr>`;
}

function addCustomTagRow(id) {
  const tbody = document.getElementById(`custom-tags-tbody-${id}`);
  if (!tbody) return;
  const emptyRow = document.getElementById(`empty-row-${id}`);
  if (emptyRow) emptyRow.remove();
  const tr = document.createElement('tbody');
  tr.innerHTML = buildCustomTagRow('', '');
  tbody.appendChild(tr.querySelector('tr'));
  tbody.querySelector('.custom-tag-row:last-child .custom-label-input').focus();
}

function saveEditorChanges(id) {
  const p = App.profiles.find(x => x.id === id);
  if (!p) return;
  p.tags = {};
  const tbody = document.getElementById(`custom-tags-tbody-${id}`);
  if (tbody) {
    tbody.querySelectorAll('tr.custom-tag-row').forEach(row => {
      const label = row.querySelector('.custom-label-input')?.value.trim();
      const tagVal = row.querySelector('.custom-tag-input')?.value.trim();
      if (label && tagVal) p.tags[label] = tagVal;
    });
  }
  persistProfiles();
  toast('Saved', 'success');
}

async function handleEditTagDoc(event, id) {
  const file = event.target.files[0];
  if (!file) return;

  // Show filename immediately
  const resultEl = document.getElementById(`upload-result-${id}`);
  if (resultEl) {
    resultEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;color:var(--accent-light)"><path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
      <span style="color:var(--text-muted)">— Parsing...</span>
      <div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div>
    `;
  }

  try {
    const tags = await parseTagDocument(file);
    const count = Object.keys(tags).length;

    // Merge parsed tags into profile and refresh the rows without re-rendering the whole editor
    const p = App.profiles.find(x => x.id === id);
    if (p) {
      Object.assign(p.tags, tags);
      persistProfiles();

      const tbody = document.getElementById(`custom-tags-tbody-${id}`);
      if (tbody) {
        tbody.innerHTML = Object.entries(p.tags)
          .map(([k, v]) => buildCustomTagRow(k, v))
          .join('');
      }
    }

    // Show result in status bar
    if (resultEl) {
      if (count > 0) {
        const badges = Object.entries(tags).map(([k, v]) =>
          `<span style="background:rgba(79,70,229,0.15);color:#818cf8;border:1px solid rgba(79,70,229,0.3);font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace">${esc(k)} → &lt;${esc(v)}&gt;</span>`
        ).join('');
        resultEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
          <span style="color:var(--success);font-weight:600">${count} mappings loaded</span>
          <span style="color:var(--text-muted)">—</span>
          ${badges}
        `;
        toast(`Loaded ${count} mappings from "${file.name}"`, 'success');
      } else {
        resultEl.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
          <span style="color:var(--warning)">No tag mappings recognised. Check the document format or fill in the table below manually.</span>
        `;
        toast(`No mappings found in "${file.name}" — please fill manually`, 'warning');
      }
    }
  } catch (e) {
    if (resultEl) {
      resultEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
        <span style="color:var(--error)">${esc(e.message)}</span>
      `;
    }
    toast(e.message, 'error');
  }
  event.target.value = '';
}

// ============================================================
// TAG MAPPING MODAL HELPERS
// ============================================================
function renderTagMappingBody() {
  const tbody = document.getElementById('modal-custom-tags-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
}

function resetTagMappingBody() {
  const tbody = document.getElementById('modal-custom-tags-tbody');
  if (tbody) tbody.innerHTML = '';
}

function populateTagMappingBody(tags) {
  const tbody = document.getElementById('modal-custom-tags-tbody');
  if (!tbody) return;
  tbody.innerHTML = Object.entries(tags).map(([k, v]) => buildCustomTagRow(k, v)).join('');
}

function collectTagMappings() {
  const tags = {};
  const tbody = document.getElementById('modal-custom-tags-tbody');
  if (tbody) {
    tbody.querySelectorAll('tr.custom-tag-row').forEach(row => {
      const label = row.querySelector('.custom-label-input')?.value.trim();
      const tagVal = row.querySelector('.custom-tag-input')?.value.trim();
      if (label && tagVal) tags[label] = tagVal;
    });
  }
  return tags;
}

function addModalCustomTagRow() {
  const tbody = document.getElementById('modal-custom-tags-tbody');
  if (!tbody) return;
  const tr = document.createElement('tbody');
  tr.innerHTML = buildCustomTagRow('', '');
  tbody.appendChild(tr.querySelector('tr'));
  tbody.querySelector('.custom-tag-row:last-child .custom-label-input').focus();
}

// ============================================================
// TAG DOCUMENT PARSING (Word / Excel / XML)
// ============================================================
async function parseTagDocument(file) {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  console.log('[XMLFlow] parseTagDocument:', file.name, 'type:', mime);

  // Detect format by extension OR MIME type
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') ||
    mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv');
  const isWord  = name.endsWith('.docx') || name.endsWith('.doc') ||
    mime.includes('word') || mime.includes('openxmlformats-officedocument.wordprocessingml');
  const isXML   = (name.endsWith('.xml') || name.endsWith('.txt') ||
    mime.includes('text/xml') || mime.includes('application/xml') || mime.includes('text/plain')) && !isWord;

  // Check libraries are loaded
  if (isExcel && typeof XLSX === 'undefined') {
    throw new Error('Excel parser (SheetJS) not loaded — please check your internet connection and hard-refresh the page (Ctrl+Shift+R).');
  }
  if (isWord && typeof mammoth === 'undefined') {
    throw new Error('Word parser (mammoth.js) not loaded — please check your internet connection and hard-refresh the page (Ctrl+Shift+R).');
  }

  if (isExcel) return parseExcel(file);
  if (isWord)  return parseWord(file);
  if (isXML)   return parseXMLDoc(file);

  // Last resort: try as plain text
  return parseAsPlainText(file);
}

// Helper: turn any label into a clean key, avoiding collisions with core types
function normalizeKey(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// --- Excel ---
async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const tags = {};

        console.log('[XMLFlow] Excel rows found:', rows.length, rows);

        const firstRowLooksLikeHeader = rows.length > 0 &&
          rows[0] && typeof rows[0][0] === 'string' &&
          /type|content|name|label|tag|description/i.test(String(rows[0][0]));
        const startRow = firstRowLooksLikeHeader ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 2) continue;
          const rawLabel = String(row[0] || '').trim();
          const rawTag   = String(row[1] || '').replace(/[<>\/\s]/g, '');
          if (!rawLabel || !rawTag) continue;

          const key = normalizeKey(rawLabel);
          console.log(`[XMLFlow] Row ${i}: "${rawLabel}" → key="${key}", tag="${rawTag}"`);
          tags[key] = rawTag;
        }
        resolve(tags);
      } catch (err) {
        console.error('[XMLFlow] Excel parse error:', err);
        reject(new Error('Excel parse error: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Could not read Excel file'));
    reader.readAsArrayBuffer(file);
  });
}

// --- XML ---
async function parseXMLDoc(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(e.target.result, 'text/xml');
        const tags = {};

        const defs = doc.querySelectorAll('mapping, definition, tagMapping, tag, item');
        if (defs.length > 0) {
          defs.forEach(d => {
            const rawLabel = (d.getAttribute('type') || d.getAttribute('contentType') || d.getAttribute('name') || '').trim();
            const rawTag   = (d.getAttribute('tag') || d.getAttribute('value') || d.textContent || '').replace(/[<>\/]/g, '').trim();
            if (!rawLabel || !rawTag) return;
            const key = normalizeKey(rawLabel);
            tags[key] = rawTag;
          });
        }

        if (Object.keys(tags).length === 0) {
          const names = new Set();
          Array.from(doc.getElementsByTagName('*')).forEach(el => names.add(el.tagName.toLowerCase()));
          names.forEach(n => { tags[normalizeKey(n)] = n; });
        }
        resolve(tags);
      } catch (e) { reject(new Error('XML parse error: ' + e.message)); }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

// --- Plain text / CSV fallback ---
async function parseAsPlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const tags = {};
        console.log('[XMLFlow] Plain text lines:', lines.length);

        for (const line of lines) {
          let rawLabel = '', rawTag = '';

          const tabParts = line.split(/\t|,/);
          if (tabParts.length >= 2) {
            rawLabel = tabParts[0].trim();
            rawTag   = tabParts[1].replace(/[<>\/\s"']/g, '').trim();
          } else {
            const kvMatch = line.match(/^(.+?)\s*[:|=\-\u2013\u2192\u2014]\s*<?([a-zA-Z][a-zA-Z0-9_\-]*)>?\s*$/);
            if (kvMatch) { rawLabel = kvMatch[1].trim(); rawTag = kvMatch[2].replace(/[<>\/]/g, '').trim(); }
          }

          if (rawLabel && rawTag) {
            tags[normalizeKey(rawLabel)] = rawTag;
          }
        }
        console.log('[XMLFlow] Plain text tags:', tags);
        resolve(tags);
      } catch (err) {
        reject(new Error('Could not parse file as text: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

// --- Word (.docx) ---
async function parseWord(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const tags = {};

        const ab1 = e.target.result.slice(0);
        const ab2 = e.target.result.slice(0);

        // --- Strategy 1: Extract HTML and parse tables ---
        let htmlText = '';
        try {
          const htmlResult = await mammoth.convertToHtml({ arrayBuffer: ab1 });
          htmlText = htmlResult.value;
          console.log('[XMLFlow] mammoth HTML length:', htmlText.length);
        } catch (htmlErr) {
          console.warn('[XMLFlow] mammoth.convertToHtml failed:', htmlErr.message);
        }

        if (htmlText) {
          const parser = new DOMParser();
          const htmlDoc = parser.parseFromString(htmlText, 'text/html');

          // Strategy A: Headings whose text IS a tag name — e.g. "<book>", "<h1>", "book"
          // Handles explanation/guide docs where each heading = one XML tag
          htmlDoc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
            const text = h.textContent.trim();
            const bracketMatch = text.match(/^<([a-zA-Z][a-zA-Z0-9_-]*)>$/);
            const bareMatch    = !bracketMatch && text.match(/^([a-zA-Z][a-zA-Z0-9_-]*)$/);
            const tagName = bracketMatch ? bracketMatch[1] : (bareMatch ? bareMatch[1] : null);
            if (tagName && tagName.length < 40) {
              console.log('[XMLFlow] Word heading tag: "' + text + '" → "' + tagName + '"');
              tags[tagName] = tagName;
            }
          });

          // Strategy B: 2-column tables (Label | Tag mapping format)
          if (Object.keys(tags).length === 0) {
            htmlDoc.querySelectorAll('tr').forEach((row, rowIdx) => {
              const cells = Array.from(row.querySelectorAll('td, th'));
              if (cells.length >= 2) {
                const rawLabel = cells[0].textContent.trim();
                const rawTag   = cells[1].textContent.replace(/[<>\/\s]/g, '');
                if (rawLabel && rawTag.length > 0 && rawTag.length < 40) {
                  const key = normalizeKey(rawLabel);
                  console.log('[XMLFlow] Word table row ' + rowIdx + ': "' + rawLabel + '" → key="' + key + '", tag="' + rawTag + '"');
                  tags[key] = rawTag;
                }
              }
            });
          }

          // Strategy C: Paragraph "Label: tag" lines
          if (Object.keys(tags).length === 0) {
            htmlDoc.querySelectorAll('p').forEach(p => {
              const txt = p.textContent.trim();
              const m = txt.match(/^(.+?)\s*[:|=\-–→—]\s*<?([a-zA-Z][a-zA-Z0-9_\-]*)>?\s*$/);
              if (m) {
                const rawLabel = m[1].trim();
                const rawTag   = m[2].replace(/[<>/]/g, '').trim();
                if (rawLabel && rawTag && rawTag.length < 40) {
                  tags[normalizeKey(rawLabel)] = rawTag;
                }
              }
            });
          }
        }

        // --- Strategy 2 (fallback): Raw text line-by-line parsing ---
        if (Object.keys(tags).length === 0) {
          console.log('[XMLFlow] No tags from HTML, trying raw text...');
          try {
            const textResult = await mammoth.extractRawText({ arrayBuffer: ab2 });
            const lines = textResult.value.split('\n').map(l => l.trim()).filter(Boolean);
            console.log('[XMLFlow] Word raw lines:', lines.length);
            for (const line of lines) {
              const m = line.match(/^(.+?)\s*[:|=\-\u2013\u2192\u2014]\s*<?([a-zA-Z][a-zA-Z0-9_\-]*)>?\s*$/);
              if (m) {
                const rawLabel = m[1].trim();
                const rawTag   = m[2].replace(/[<>\/]/g, '').trim();
                if (rawLabel && rawTag) {
                  const key = normalizeKey(rawLabel);
                  console.log(`[XMLFlow] Word line: "${rawLabel}" → key="${key}", tag="${rawTag}"`);
                  tags[key] = rawTag;
                }
              }
            }
          } catch (textErr) {
            console.warn('[XMLFlow] mammoth.extractRawText failed:', textErr.message);
          }
        }

        console.log('[XMLFlow] Final tags from Word doc:', tags);
        resolve(tags);
      } catch (err) {
        console.error('[XMLFlow] Word parse error:', err);
        reject(new Error('Word parse error: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Could not read Word file'));
    reader.readAsArrayBuffer(file);
  });
}

function typeMap() {
  return {
    // ---- TITLE ----
    'title': 'title', 'book title': 'title', 'booktitle': 'title',
    'doc title': 'title', 'document title': 'title', 'main title': 'title',
    'article title': 'title', 'publication title': 'title', 'cover title': 'title',
    'full title': 'title', 'doctitle': 'title', 'book name': 'title',
    'name': 'title', 'title page': 'title', 'titl': 'title',

    // ---- HEADING ----
    'heading': 'heading', 'head': 'heading', 'h1': 'heading',
    'chapter': 'heading', 'chapter heading': 'heading', 'chapter title': 'heading',
    'section heading': 'heading', 'section title': 'heading', 'section': 'heading',
    'main heading': 'heading', 'major heading': 'heading', 'primary heading': 'heading',
    'level 1 heading': 'heading', 'level1 heading': 'heading', 'heading 1': 'heading',
    'heading1': 'heading', 'head1': 'heading', 'chap head': 'heading',
    'chap title': 'heading', 'part': 'heading', 'part title': 'heading',
    'unit': 'heading', 'unit title': 'heading', 'topic': 'heading',
    'topic title': 'heading', 'cht': 'heading', 'chn': 'heading',

    // ---- SUBHEADING ----
    'subheading': 'subheading', 'sub heading': 'subheading', 'sub-heading': 'subheading',
    'subhead': 'subheading', 'h2': 'subheading', 'h3': 'subheading', 'h4': 'subheading',
    'sub section': 'subheading', 'subsection': 'subheading', 'sub-section': 'subheading',
    'secondary heading': 'subheading', 'minor heading': 'subheading',
    'level 2 heading': 'subheading', 'level2 heading': 'subheading', 'heading 2': 'subheading',
    'heading2': 'subheading', 'head2': 'subheading', 'heading 3': 'subheading',
    'heading3': 'subheading', 'head3': 'subheading', 'sub title': 'subheading',
    'subtitle': 'subheading', 'sub-title': 'subheading', 'sidebar heading': 'subheading',
    'box heading': 'subheading', 'panel heading': 'subheading',

    // ---- PARAGRAPH ----
    'paragraph': 'paragraph', 'para': 'paragraph', 'body': 'paragraph',
    'body text': 'paragraph', 'text': 'paragraph', 'p': 'paragraph', 'normal': 'paragraph',
    'default': 'paragraph', 'content': 'paragraph', 'body copy': 'paragraph',
    'running text': 'paragraph', 'main text': 'paragraph', 'general text': 'paragraph',
    'description': 'paragraph', 'detail': 'paragraph', 'details': 'paragraph',
    'intro': 'paragraph', 'introduction': 'paragraph', 'abstract': 'paragraph',
    'note': 'paragraph', 'notes': 'paragraph', 'remark': 'paragraph',
    'extract': 'paragraph', 'quote': 'paragraph', 'blockquote': 'paragraph',
    'indented text': 'paragraph', 'block text': 'paragraph',

    // ---- LIST ITEM ----
    'list item': 'listitem', 'listitem': 'listitem', 'list': 'listitem',
    'bullet': 'listitem', 'bullet point': 'listitem', 'item': 'listitem', 'li': 'listitem',
    'numbered': 'listitem', 'numbered item': 'listitem', 'numbered list': 'listitem',
    'ordered list': 'listitem', 'unordered list': 'listitem', 'bulleted list': 'listitem',
    'enumeration': 'listitem', 'enum': 'listitem', 'point': 'listitem',
    'list element': 'listitem', 'list entry': 'listitem',

    // ---- CAPTION ----
    'caption': 'caption', 'figure caption': 'caption', 'fig caption': 'caption',
    'image caption': 'caption', 'figcaption': 'caption', 'table caption': 'caption',
    'fig': 'caption', 'figure': 'caption', 'figure note': 'caption',
    'photo caption': 'caption', 'picture caption': 'caption',
    'illustration caption': 'caption', 'chart caption': 'caption',
    'legend': 'caption', 'fig legend': 'caption', 'figure legend': 'caption',
  };
}

function matchType(raw, tm) {
  const k = raw.toLowerCase().trim();
  if (tm[k]) return tm[k];
  for (const [key, val] of Object.entries(tm)) {
    if (k.includes(key) || key.includes(k)) return val;
  }
  return null;
}

// ============================================================
// TAG DOC UPLOAD HANDLERS (for create modal)
// ============================================================
function handleTagDocSelect(event) {
  const file = event.target.files[0];
  if (file) processNewProfileTagDoc(file);
  event.target.value = '';
}

function handleTagDocDragOver(event) {
  event.preventDefault();
  document.getElementById('tag-doc-drop').classList.add('drag-over');
}

function handleTagDocDragLeave() {
  document.getElementById('tag-doc-drop').classList.remove('drag-over');
}

function handleTagDocDrop(event) {
  event.preventDefault();
  document.getElementById('tag-doc-drop').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) processNewProfileTagDoc(file);
}

async function processNewProfileTagDoc(file) {
  const statusEl = document.getElementById('tag-doc-status');

  // Show filename immediately so user sees the file was received
  statusEl.style.cssText = 'color:var(--text-muted);margin-top:10px;font-size:12px';
  statusEl.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      style="width:13px;height:13px;vertical-align:middle;margin-right:5px;color:var(--accent-light)">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
    <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
    &nbsp;—&nbsp; Parsing...
    <span style="display:inline-block;width:10px;height:10px;border:1.5px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-left:6px"></span>
  `;

  try {
    const tags = await parseTagDocument(file);
    const count = Object.keys(tags).length;

    if (count === 0) {
      statusEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2.5"
          style="width:14px;height:14px;vertical-align:middle;margin-right:5px">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
        &nbsp;<span style="color:var(--warning)">No mappings recognised — please fill the table below manually.</span>
      `;
      toast('No tag mappings found — fill the table manually', 'warning');
      return;
    }

    populateTagMappingBody(tags);

    const badges = Object.entries(tags).map(([k, v]) =>
      `<span style="background:rgba(79,70,229,0.15);color:#818cf8;border:1px solid rgba(79,70,229,0.3);
        font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace
        ">${esc(k)} → &lt;${esc(v)}&gt;</span>`
    ).join(' ');

    statusEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2.5"
        style="width:14px;height:14px;vertical-align:middle;margin-right:5px">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
      <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
      &nbsp;<span style="color:var(--success);font-weight:600">${count} mappings loaded</span>
      &nbsp;—&nbsp;
      <span style="display:inline-flex;gap:4px;flex-wrap:wrap">${badges}</span>
    `;
    toast(`Loaded ${count} mappings from "${file.name}"`, 'success');
  } catch (e) {
    statusEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2.5"
        style="width:14px;height:14px;vertical-align:middle;margin-right:5px">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
      <strong style="color:var(--text-primary)">${esc(file.name)}</strong>
      &nbsp;<span style="color:var(--error)">${esc(e.message)}</span>
    `;
    toast(e.message, 'error');
  }
}

// ============================================================
// PDF UPLOAD SCREEN
// ============================================================
function initUploadScreen() {
  renderProfileGrid();
  if (!App.project.file) {
    document.getElementById('file-info-card').classList.add('hidden');
    document.getElementById('profile-selector-section').classList.add('hidden');
    document.getElementById('process-btn-container').classList.add('hidden');
  }
}

function renderProfileGrid() {
  const grid = document.getElementById('profile-grid');
  if (!grid) return;
  grid.innerHTML = App.profiles.map(p => `
    <div class="profile-option ${App.activeProfileId === p.id ? 'selected' : ''}"
         data-opt-profile="${p.id}"
         onclick="selectUploadProfile('${p.id}')">
      <div class="profile-option-name">${esc(p.name)}</div>
      <div class="profile-option-count">${Object.keys(p.tags).length} tags</div>
    </div>
  `).join('');
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('upload-drop-zone').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('upload-drop-zone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('upload-drop-zone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    loadPDF(file);
  } else {
    toast('Please drop a PDF file', 'error');
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) loadPDF(file);
  event.target.value = '';
}

function clearFile() {
  App.project.file = null;
  App.project.pdfDoc = null;
  document.getElementById('file-info-card').classList.add('hidden');
  document.getElementById('profile-selector-section').classList.add('hidden');
  document.getElementById('process-btn-container').classList.add('hidden');
}

async function loadPDF(file) {
  App.project.file = file;
  App.project.fileName = file.name;

  document.getElementById('file-info-card').classList.remove('hidden');
  document.getElementById('file-name-display').textContent = file.name;
  document.getElementById('file-meta-display').textContent = fmtSize(file.size) + ' · Analyzing...';
  const badge = document.getElementById('file-type-badge');
  badge.textContent = 'Analyzing...';
  badge.className = 'file-type-badge';

  try {
    const ab = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
    App.project.pdfDoc = pdfDoc;
    App.project.pageCount = pdfDoc.numPages;

    const analysis = await sniffPDFType(pdfDoc);

    const typeLabels = { digital: 'Digital', scanned: 'Scanned', mixed: 'Mixed' };
    const typeClasses = { digital: 'digital', scanned: 'scanned', mixed: 'mixed' };

    document.getElementById('file-meta-display').textContent =
      `${fmtSize(file.size)} · ${pdfDoc.numPages} pages · ${analysis.digital} digital, ${analysis.scanned} scanned`;
    badge.textContent = typeLabels[analysis.type];
    badge.className = 'file-type-badge ' + typeClasses[analysis.type];

    document.getElementById('profile-selector-section').classList.remove('hidden');
    renderProfileGrid();

    if (!App.activeProfileId && App.profiles.length > 0) {
      App.activeProfileId = App.profiles[0].id;
      renderProfileGrid();
    }

    checkProcessReady();
    toast(`PDF loaded: ${pdfDoc.numPages} page${pdfDoc.numPages !== 1 ? 's' : ''}`, 'success');

  } catch (e) {
    toast('Failed to load PDF: ' + e.message, 'error');
    clearFile();
  }
}

async function sniffPDFType(pdfDoc) {
  const sample = Math.min(5, pdfDoc.numPages);
  let digital = 0, scanned = 0;
  for (let i = 1; i <= sample; i++) {
    const page = await pdfDoc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => it.str).join('').trim();
    text.length > 30 ? digital++ : scanned++;
  }
  const ratio = digital / sample;
  const totalDigital  = Math.round(ratio * pdfDoc.numPages);
  const totalScanned  = pdfDoc.numPages - totalDigital;
  const type = ratio < 0.2 ? 'scanned' : ratio < 0.8 ? 'mixed' : 'digital';
  return { type, digital: totalDigital, scanned: totalScanned };
}

function checkProcessReady() {
  const ready = !!(App.project.file && App.activeProfileId);
  document.getElementById('process-btn-container').classList.toggle('hidden', !ready);
}

// ============================================================
// PROCESSING
// ============================================================
async function startProcessing() {
  if (!App.project.file || !App.activeProfileId) return;

  App.isProcessing = true;
  App.cancelled = false;
  App.project.pages = [];
  App.project.allBlocks = [];

  navigate('processing');
  document.getElementById('log-list').innerHTML = '';
  document.getElementById('log-count').textContent = '0 entries';

  log('info',    'Starting XML processing pipeline...');
  log('info',    `File: ${App.project.fileName}`);
  log('info',    `Profile: ${activeProfile()?.name || 'Unknown'}`);
  log('info',    `Pages: ${App.project.pageCount}`);

  let worker = null;

  try {
    const pdf = App.project.pdfDoc;
    const total = pdf.numPages;

    for (let p = 1; p <= total; p++) {
      if (App.cancelled) { log('warning', 'Processing cancelled'); break; }

      updateProgress((p - 1) / total * 100, `Processing page ${p} of ${total}...`);
      document.getElementById('processing-page-info').textContent = `Page ${p} of ${total}`;
      document.getElementById('processing-subtitle').textContent = `Processing page ${p} of ${total}...`;

      try {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 2.0 });

        // Render to canvas (for preview + OCR)
        const canvas = document.getElementById('processing-canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.88);

        // Check for text layer
        const tc = await page.getTextContent();
        const rawText = tc.items.map(it => it.str).join('').trim();
        const isDigital = rawText.length > 30;

        let blocks = [];

        if (isDigital) {
          log('success', `Page ${p}: Digital — extracting text layer`);
          blocks = digitalBlocks(tc, p);
        } else {
          log('warning', `Page ${p}: Scanned — running OCR (English)`);

          if (!worker) {
            log('info', 'Initializing Tesseract OCR engine...');
            worker = await Tesseract.createWorker('eng', 1, {
              logger: m => {
                if (m.status === 'recognizing text') {
                  updateProgress(
                    (p - 1) / total * 100,
                    `OCR page ${p}: ${Math.round(m.progress * 100)}%`
                  );
                }
              },
            });
            log('success', 'OCR engine ready');
          }

          const result = await worker.recognize(imgData);
          log('success', `Page ${p}: OCR complete — confidence ${Math.round(result.data.confidence)}%`);
          blocks = ocrBlocks(result.data.text, result.data, p);
        }

        App.project.pages.push({ pageNum: p, imageData: imgData, isDigital, blocks });
        App.project.allBlocks.push(...blocks);
        log('info', `Page ${p}: ${blocks.length} content blocks identified`);

      } catch (pageErr) {
        log('error', `Page ${p} error: ${pageErr.message}`);
      }
    }

    if (worker) { await worker.terminate(); log('info', 'OCR engine terminated'); }

    // Update stats
    App.stats.projects++;
    App.stats.pages += total;
    App.stats.tags  += App.project.allBlocks.length;
    saveStats();

    updateProgress(100, 'Processing complete!');
    log('success', `✓ Done — ${App.project.allBlocks.length} blocks across ${total} pages`);

    document.getElementById('nav-review').classList.remove('hidden');
    document.getElementById('nav-output').classList.remove('hidden');

    toast('Processing complete!', 'success');
    if (!App.cancelled) setTimeout(() => navigate('review'), 1400);

  } catch (err) {
    log('error', 'Fatal error: ' + err.message);
    toast('Processing failed: ' + err.message, 'error');
  }
  App.isProcessing = false;
}

function cancelProcessing() {
  App.cancelled = true;
  App.isProcessing = false;
  navigate('upload');
}

function updateProgress(pct, label) {
  document.getElementById('main-progress').style.width = Math.round(pct) + '%';
  document.getElementById('progress-label-text').textContent = label || '';
  document.getElementById('progress-pct').textContent = Math.round(pct) + '%';
}

function log(type, msg) {
  const list = document.getElementById('log-list');
  if (!list) return;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.innerHTML = `<div class="log-dot"></div><span class="log-time">${time}</span><span>${esc(msg)}</span>`;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
  const cnt = document.getElementById('log-count');
  if (cnt) cnt.textContent = list.children.length + ' entries';
}

// ============================================================
// CONTENT EXTRACTION & CLASSIFICATION
// ============================================================
function digitalBlocks(textContent, pageNum) {
  const items = textContent.items.filter(it => it.str.trim().length > 0);
  if (!items.length) return [];

  // Sort top-to-bottom (PDF y is from bottom, so sort descending by y5)
  const sorted = [...items].sort((a, b) => {
    const dy = Math.round(b.transform[5] / 4) * 4 - Math.round(a.transform[5] / 4) * 4;
    return dy !== 0 ? dy : a.transform[4] - b.transform[4];
  });

  // Group into lines by y-proximity
  const lines = [];
  let curLine = null;
  for (const it of sorted) {
    const y = Math.round(it.transform[5]);
    const fs = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 12;
    if (!curLine || Math.abs(curLine.y - y) > 4) {
      curLine = { y, parts: [], maxFS: 0 };
      lines.push(curLine);
    }
    curLine.parts.push(it.str);
    curLine.maxFS = Math.max(curLine.maxFS, fs);
  }

  // Compute median font size
  const fsSorted = [...lines].map(l => l.maxFS).sort((a, b) => a - b);
  const medFS = fsSorted[Math.floor(fsSorted.length / 2)] || 12;

  const raw = [];
  let bid = 0;
  for (const ln of lines) {
    const text = ln.parts.join('').trim();
    if (!text || text.length < 2) continue;
    raw.push({
      id: `${pageNum}_${bid++}`,
      pageNum,
      type: classifyDigital(text, ln.maxFS, medFS, bid === 1),
      text,
      fontSize: ln.maxFS,
      confidence: 90,
    });
  }
  return mergeParagraphs(raw);
}

function ocrBlocks(rawText, ocrData, pageNum) {
  const paras = rawText.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 1);
  const blocks = [];
  let bid = 0;
  let isFirstNonEmpty = true;

  for (const para of paras) {
    const lines = para.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    for (const text of lines) {
      blocks.push({
        id: `${pageNum}_${bid++}`,
        pageNum,
        type: classifyOCR(text, isFirstNonEmpty && bid <= 3),
        text,
        fontSize: 12,
        confidence: Math.round(ocrData.confidence || 70),
      });
      isFirstNonEmpty = false;
    }
  }
  return mergeParagraphs(blocks);
}

function classifyDigital(text, fs, medFS, isFirst) {
  const words = text.trim().split(/\s+/).length;
  const ratio  = fs / medFS;
  const short  = words <= 10 && text.length < 120;
  const allCap = text === text.toUpperCase() && /[A-Z]/.test(text);
  if (/^[\u2022\u2023\u25E6\u2043\u2219\-\*]\s/.test(text) || /^\d+[\.\)]\s/.test(text)) return 'listitem';
  if (short && (allCap || ratio > 1.8)) return isFirst ? 'title' : 'heading';
  if (short && ratio > 1.3) return isFirst ? 'title' : 'heading';
  if (short && ratio > 1.1) return 'subheading';
  if (isFirst && short) return 'title';
  if (fs < medFS * 0.85 && short) return 'caption';
  return 'paragraph';
}

function classifyOCR(text, isFirst) {
  const words = text.trim().split(/\s+/).length;
  const short  = words <= 10 && text.length < 120;
  const allCap = text === text.toUpperCase() && /[A-Z]{3,}/.test(text);
  if (/^[\u2022\u2023\u25E6\u2043\u2219\-\*]\s/.test(text) || /^\d+[\.\)]\s/.test(text)) return 'listitem';
  if (/^(chapter|section|part|unit|article)\s+\d+/i.test(text)) return 'heading';
  if (allCap && short) return isFirst ? 'title' : 'heading';
  if (isFirst && short) return 'title';
  if (short && words <= 6) return 'heading';
  if (short && words <= 10) return 'subheading';
  return 'paragraph';
}

function mergeParagraphs(blocks) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    if (
      blocks[i].type === 'paragraph' &&
      i + 1 < blocks.length &&
      blocks[i + 1].type === 'paragraph' &&
      blocks[i + 1].pageNum === blocks[i].pageNum
    ) {
      let merged = blocks[i].text;
      while (
        i + 1 < blocks.length &&
        blocks[i + 1].type === 'paragraph' &&
        blocks[i + 1].pageNum === blocks[i].pageNum &&
        merged.split(/\s+/).length < 80
      ) {
        merged += ' ' + blocks[i + 1].text;
        i++;
      }
      out.push({ ...blocks[i], text: merged });
    } else {
      out.push(blocks[i]);
    }
    i++;
  }
  return out;
}

// ============================================================
// REVIEW SCREEN
// ============================================================
function initReviewScreen() {
  App.reviewPageNum = 1;
  drawReviewPage();
}

function drawReviewPage() {
  const pn = App.reviewPageNum;
  const total = App.project.pages.length;
  document.getElementById('review-page-info').textContent = `Page ${pn} of ${total}`;

  // Draw page image
  const pd = App.project.pages.find(p => p.pageNum === pn);
  if (pd) {
    const c = document.getElementById('review-canvas');
    const img = new Image();
    img.onload = () => { c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); };
    img.src = pd.imageData;
  }

  // Render blocks
  const blocks = App.project.allBlocks.filter(b => b.pageNum === pn);
  const list = document.getElementById('blocks-list');
  document.getElementById('blocks-count').textContent = `${blocks.length} block${blocks.length !== 1 ? 's' : ''}`;

  if (!blocks.length) {
    list.innerHTML = '<div class="empty-state" style="padding:32px 16px"><div class="empty-title">No blocks on this page</div></div>';
    return;
  }

  list.innerHTML = blocks.map(b => `
    <div class="block-item" id="blk-${b.id}">
      <div class="block-header">
        <span class="block-type-badge type-${b.type}" id="badge-${b.id}">${typeLabel(b.type)}</span>
        <select class="block-type-select" onchange="changeType('${b.id}', this.value)">
          ${CONTENT_TYPES.map(ct => `<option value="${ct.id}" ${b.type === ct.id ? 'selected' : ''}>${ct.label}</option>`).join('')}
        </select>
      </div>
      <div class="block-text">${esc(b.text)}</div>
      <div class="block-confidence">
        <span>Confidence: ${b.confidence}%</span>
        <div class="conf-bar">
          <div class="conf-fill" style="width:${b.confidence}%;background:${b.confidence > 80 ? 'var(--success)' : b.confidence > 55 ? 'var(--warning)' : 'var(--error)'}"></div>
        </div>
      </div>
    </div>
  `).join('');
}

function changeType(blockId, newType) {
  const b = App.project.allBlocks.find(x => x.id === blockId);
  if (!b) return;
  b.type = newType;
  const badge = document.getElementById('badge-' + blockId);
  if (badge) { badge.className = `block-type-badge type-${newType}`; badge.textContent = typeLabel(newType); }
}

function prevReviewPage() {
  if (App.reviewPageNum > 1) { App.reviewPageNum--; drawReviewPage(); }
}

function nextReviewPage() {
  if (App.reviewPageNum < App.project.pages.length) { App.reviewPageNum++; drawReviewPage(); }
}

// ============================================================
// XML GENERATION
// ============================================================
function generateXML() {
  const profile = activeProfile();
  if (!profile) { toast('No client profile selected', 'error'); return; }

  const blocks = App.project.allBlocks.filter(b => b.type !== 'ignore');
  if (!blocks.length) { toast('No content blocks to export', 'warning'); return; }

  let xml = '';
  let lastPage = -1;

  for (const b of blocks) {
    if (b.pageNum !== lastPage) {
      xml += (lastPage === -1 ? '' : '\n') + `<!-- Page ${b.pageNum} -->\n`;
      lastPage = b.pageNum;
    }
    const tag = profile.tags[b.type] || b.type;
    xml += `<${tag}>${escXml(b.text)}</${tag}>\n`;
  }

  App.project.xmlOutput = xml;
  navigate('output');
}

function renderOutputScreen() {
  const xml     = App.project.xmlOutput;
  const profile = activeProfile();
  const blocks  = App.project.allBlocks.filter(b => b.type !== 'ignore');

  document.getElementById('out-blocks').textContent  = blocks.length;
  document.getElementById('out-pages').textContent   = App.project.pages.length;
  document.getElementById('out-profile').textContent = profile?.name || 'None';
  document.getElementById('out-filename').textContent = App.project.fileName || '—';

  document.getElementById('xml-display').innerHTML = highlightXML(xml);

  // Tag distribution
  const dist = {};
  blocks.forEach(b => {
    const tag = profile?.tags[b.type] || DEFAULT_TAGS[b.type] || b.type;
    dist[tag] = (dist[tag] || 0) + 1;
  });
  document.getElementById('tag-distribution').innerHTML = Object.entries(dist).map(([tag, cnt]) => `
    <div class="info-row">
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#818cf8">&lt;${esc(tag)}&gt;</span>
      <strong>${cnt}</strong>
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">No blocks</div>';
}

function highlightXML(xml) {
  if (!xml) return '<span style="color:var(--text-muted)">No XML output yet.</span>';
  return xml
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(&lt;!--.*?--&gt;)/g, '<span class="xml-comment">$1</span>')
    .replace(/(&lt;\/[a-zA-Z0-9_\-:]+&gt;)/g, '<span class="xml-close-tag">$1</span>')
    .replace(/(&lt;[a-zA-Z0-9_\-:]+(?:\s[^&]*?)?&gt;)/g, '<span class="xml-tag">$1</span>');
}

function copyXML() {
  if (!App.project.xmlOutput) { toast('Nothing to copy', 'warning'); return; }
  navigator.clipboard.writeText(App.project.xmlOutput)
    .then(() => toast('Copied to clipboard!', 'success'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = App.project.xmlOutput;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('Copied to clipboard!', 'success');
    });
}

function downloadXML() {
  if (!App.project.xmlOutput) { toast('Nothing to download', 'warning'); return; }
  const name = (App.project.fileName || 'output').replace(/\.pdf$/i, '') + '_tagged.xml';
  downloadText(App.project.xmlOutput, name, 'text/xml');
  toast('Downloaded: ' + name, 'success');
}

// ============================================================
// STATISTICS
// ============================================================
function loadStats() {
  try {
    const raw = localStorage.getItem('xmlflow_stats');
    if (raw) App.stats = JSON.parse(raw);
  } catch (e) {}
  updateHomeStats();
}

function saveStats() {
  localStorage.setItem('xmlflow_stats', JSON.stringify(App.stats));
  updateHomeStats();
}

function updateHomeStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-projects', App.stats.projects || 0);
  set('stat-profiles', App.profiles.length);
  set('stat-pages',    App.stats.pages || 0);
  set('stat-tags',     App.stats.tags  || 0);
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ============================================================
// TOAST
// ============================================================
function toast(msg, type = 'info') {
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || ''}<span style="flex:1">${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'all 0.3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 320);
  }, 3600);
}

// ============================================================
// UTILITIES
// ============================================================
function activeProfile() {
  return App.profiles.find(p => p.id === App.activeProfileId) || App.profiles[0];
}

function typeLabel(id) {
  return CONTENT_TYPES.find(t => t.id === id)?.label || id;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

function escXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString();
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function updateUI() {
  updateProfilesBadge();
  updateHomeStats();
}
