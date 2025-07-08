// UI Management Module
export class UIManager {
  constructor() {
    this.elements = this.getElements();
    this.setupEventListeners();
  }

  getElements() {
    const ids = [
      'llm-provider', 'llm-model', 'api-key', 'base-url', 'save-config',
      'excel-files', 'process-files', 'load-sample-data', 'processing-status',
      'status-text', 'results-section', 'export-data', 'export-fixes',
      'auto-fix-all', 'config-toggle', 'llm-config-body', 'config-chevron'
    ];
    return Object.fromEntries(ids.map(id => [id.replace(/-/g, ''), document.getElementById(id)]));
  }

  setupEventListeners() {
    // Provider change handler
    this.elements.llmprovider.addEventListener('change', e => {
      const urls = {
        openai: 'https://api.openai.com/v1',
        custom: 'https://llmfoundry.straive.com/v1'
      };
      this.elements.baseurl.value = urls[e.target.value] || urls.custom;
      this.elements.llmmodel.value = 'gpt-4o-mini';
    });

    // File input change
    this.elements.excelfiles.addEventListener('change', () => {
      this.elements.processfiles.disabled = this.elements.excelfiles.files.length === 0;
    });

    // Collapse chevron animation
    ['shown', 'hidden'].forEach(event => {
      this.elements.llmconfigbody.addEventListener(`${event}.bs.collapse`, () => {
        const isShown = event === 'shown';
        this.elements.configchevron.className = `fas fa-chevron-${isShown ? 'up' : 'down'} float-end mt-1`;
      });
    });
  }

  showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
    alert.style.zIndex = '9999';
    alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
  }

  updateStatus(text) {
    this.elements.statustext.textContent = text;
  }

  showProcessing(show = true) {
    this.elements.processingstatus.classList.toggle('d-none', !show);
  }

  updateResults(consolidatedData, exceptionRecords, fixHistory) {
    // Update statistics
    ['total-files', 'total-records', 'valid-records', 'exception-records'].forEach((id, i) => {
      const values = [
        this.elements.excelfiles.files.length,
        consolidatedData.length + exceptionRecords.length,
        consolidatedData.length,
        exceptionRecords.length
      ];
      document.getElementById(id).textContent = values[i];
    });

    // Update export button states
    const hasExceptions = exceptionRecords.length > 0;
    const hasData = consolidatedData.length > 0;
    
    this.elements.exportdata.disabled = hasExceptions || !hasData;
    this.elements.exportfixes.disabled = fixHistory.length === 0;

    // Update export button appearance
    const states = [
      { condition: hasExceptions, icon: 'lock', text: 'Export All Data (Fix Exceptions First)', class: 'secondary' },
      { condition: hasData, icon: 'download', text: 'Export All Data', class: 'primary' },
      { condition: true, icon: 'download', text: 'Export All Data', class: 'secondary' }
    ];

    const state = states.find(s => s.condition);
    this.elements.exportdata.innerHTML = `<i class="fas fa-${state.icon} me-2"></i>${state.text}`;
    this.elements.exportdata.className = this.elements.exportdata.className.replace(/btn-(primary|secondary)/, `btn-${state.class}`);

    this.elements.resultssection.classList.remove('d-none');
  }

  displayExceptions(exceptionRecords) {
    const section = document.getElementById('exceptions-section');
    const table = document.getElementById('exceptions-table');
    
    if (exceptionRecords.length === 0) {
      section.classList.add('d-none');
      return;
    }

    section.classList.remove('d-none');
    table.innerHTML = `
      <div class="table-responsive">
        <table class="table table-striped table-hover">
          <thead class="table-dark">
            <tr><th>Source File</th><th>Product Name</th><th>Errors</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${exceptionRecords.map((record, index) => `
              <tr>
                <td>${record._source_file}</td>
                <td>${record.product_name || 'N/A'}</td>
                <td>
                  <ul class="list-unstyled mb-0">
                    ${record._validation_errors.map(error => `<li class="text-danger">${error}</li>`).join('')}
                  </ul>
                </td>
                <td>
                  <button class="btn btn-sm btn-warning" onclick="window.fixRecord(${index})">
                    <i class="fas fa-wrench me-1"></i>Auto-fix
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  displayFixHistory(fixHistory) {
    const section = document.getElementById('fix-history-section');
    const content = document.getElementById('fix-history-content');
    
    if (fixHistory.length === 0) {
      section.classList.add('d-none');
      return;
    }

    section.classList.remove('d-none');
    content.innerHTML = fixHistory.map((fix, index) => {
      const changes = this.getChangedFields(fix.original, fix.fixed);
      return `
        <div class="card mb-3">
          <div class="card-header">
            <h6 class="mb-0">
              <i class="fas fa-file-excel me-2"></i>
              ${fix.original._source_file || 'Unknown file'} - Record ${index + 1}
              <span class="badge bg-success ms-2">${changes.length} changes</span>
            </h6>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-4">
                <h6 class="text-danger">Original Errors:</h6>
                <ul class="list-unstyled">
                  ${fix.original._validation_errors?.map(error => `<li class="text-danger small">• ${error}</li>`).join('') || '<li class="text-muted small">No errors recorded</li>'}
                </ul>
              </div>
              <div class="col-md-8">
                <h6 class="text-success">Changes Made:</h6>
                <div class="table-responsive">
                  <table class="table table-sm table-bordered">
                    <thead><tr><th>Field</th><th class="text-danger">Original</th><th class="text-success">Fixed</th></tr></thead>
                    <tbody>
                      ${changes.map(change => `
                        <tr>
                          <td><strong>${change.field}</strong></td>
                          <td class="text-danger">${change.original || '<em>empty</em>'}</td>
                          <td class="text-success">${change.fixed || '<em>empty</em>'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  displayDataPreview(consolidatedData) {
    const preview = document.getElementById('data-preview');
    
    if (consolidatedData.length === 0) {
      preview.innerHTML = '<p class="text-muted">No valid data to display</p>';
      return;
    }

    const sampleData = consolidatedData.slice(0, 10);
    const fields = Object.keys(sampleData[0]).filter(key => !key.startsWith('_'));
    
    preview.innerHTML = `
      <div class="table-responsive">
        <table class="table table-striped table-hover">
          <thead class="table-dark">
            <tr>${fields.map(field => `<th>${field}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${sampleData.map(record => `
              <tr>${fields.map(field => `<td>${record[field] || ''}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${consolidatedData.length > 10 ? `<p class="text-muted mt-2">Showing 10 of ${consolidatedData.length} records</p>` : ''}
    `;
  }

  getChangedFields(original, fixed) {
    const changes = [];
    const allFields = new Set([...Object.keys(original), ...Object.keys(fixed)]);
    
    for (const field of allFields) {
      if (field.startsWith('_')) continue;
      if (original[field] !== fixed[field]) {
        changes.push({ field, original: original[field], fixed: fixed[field] });
      }
    }
    return changes;
  }

  initializeConfig(cfg) {
    if (!cfg.configured || !cfg.apiKey) {
      const bsCollapse = new bootstrap.Collapse(this.elements.llmconfigbody, { toggle: false });
      bsCollapse.show();
    }
  }
}