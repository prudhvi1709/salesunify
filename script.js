// Excel Sales Data Consolidator - Main Application
let pyodide = null;
let consolidatedData = [];
let exceptionRecords = [];
let fixHistory = [];

// DOM Elements
const elements = {
  llmProvider: document.getElementById('llm-provider'),
  llmModel: document.getElementById('llm-model'),
  apiKey: document.getElementById('api-key'),
  baseUrl: document.getElementById('base-url'),
  saveConfig: document.getElementById('save-config'),
  excelFiles: document.getElementById('excel-files'),
  processFiles: document.getElementById('process-files'),
  loadSampleData: document.getElementById('load-sample-data'),
  processingStatus: document.getElementById('processing-status'),
  statusText: document.getElementById('status-text'),
  resultsSection: document.getElementById('results-section'),
  exportData: document.getElementById('export-data'),
  exportFixes: document.getElementById('export-fixes'),
  autoFixAll: document.getElementById('auto-fix-all'),
  configToggle: document.getElementById('config-toggle'),
  configBody: document.getElementById('llm-config-body'),
  configChevron: document.getElementById('config-chevron')
};

// Configuration Management
const config = {
  load() {
    const saved = localStorage.getItem('llm-config');
    if (!saved) return;
    
    const cfg = JSON.parse(saved);
    elements.llmProvider.value = cfg.provider || 'openai';
    elements.llmModel.value = cfg.model || 'gpt-4o-mini';
    elements.apiKey.value = cfg.apiKey || '';
    elements.baseUrl.value = cfg.baseUrl || 'https://llmfoundry.straive.com/v1';
  },
  
  save() {
    const cfg = {
      provider: elements.llmProvider.value,
      model: elements.llmModel.value,
      apiKey: elements.apiKey.value,
      baseUrl: elements.baseUrl.value,
      configured: true
    };
    localStorage.setItem('llm-config', JSON.stringify(cfg));
    showAlert('Configuration saved successfully!', 'success');
    
    // Collapse the configuration section after saving
    const bsCollapse = new bootstrap.Collapse(elements.configBody, { toggle: false });
    bsCollapse.hide();
  },
  
  get() {
    return JSON.parse(localStorage.getItem('llm-config') || '{}');
  }
};

// Load Sample Data
elements.loadSampleData.addEventListener('click', async () => {
  try {
    // Fetch the sample data file
    const response = await fetch('sampledata.xlsx');
    if (!response.ok) {
      throw new Error('Sample data file not found');
    }
    //  this also trigger process files button
    const blob = await response.blob();
    const file = new File([blob], 'sampledata.xlsx', { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    // Create a DataTransfer object to properly set the files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    elements.excelFiles.files = dataTransfer.files;
    
    // Trigger the change event to update UI
    elements.excelFiles.dispatchEvent(new Event('change', { bubbles: true }));
    
    showAlert('Sample data loaded successfully!', 'success');
    
    // Auto-trigger processing if API is configured
    const cfg = config.get();
    if (cfg.apiKey) {
      showProcessing(true);
      try {
        await processExcelFiles(elements.excelFiles.files);
        showAlert('Sample data processed successfully!', 'success');
      } catch (error) {
        showAlert(`Processing failed: ${error.message}`, 'danger');
      } finally {
        showProcessing(false);
      }
    } else {
      showAlert('Sample data loaded. Please configure API key and click "Process Files" to analyze the data.', 'info');
    }
  } catch (error) {
    console.error('Error loading sample data:', error);
    showAlert('Failed to load sample data: ' + error.message, 'danger');
  }
});

// Utility Functions
const showAlert = (message, type = 'info') => {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
  alertDiv.style.zIndex = '9999';
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
};

const updateStatus = (text) => {
  elements.statusText.textContent = text;
};

const showProcessing = (show = true) => {
  elements.processingStatus.classList.toggle('d-none', !show);
};

// Pyodide Initialization
const initPyodide = async () => {
  if (pyodide) return pyodide;
  
  updateStatus('Loading Pyodide...');
  pyodide = await loadPyodide();
  
  updateStatus('Installing packages...');
  await pyodide.loadPackage(['pandas', 'micropip']);
  
  // Install openpyxl using micropip
  await pyodide.runPython(`
    import micropip
  `);
  
  await pyodide.runPythonAsync(`
    await micropip.install('openpyxl')
  `);
  
  await pyodide.runPython(`
    import pandas as pd
    import json
    import re
    from datetime import datetime
    import numpy as np
  `);
  
  return pyodide;
};

// LLM API Call
const callLLM = async (prompt, data = null) => {
  const cfg = config.get();
  if (!cfg.apiKey) {
    throw new Error('API key not configured');
  }
  
  const payload = {
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1
  };
  
  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.choices[0].message.content;
};

// Korean Header Translation
const translateHeaders = async (headers) => {
  const prompt = `
Translate these Korean Excel headers to English standard sales data fields.
Return ONLY a JSON object mapping Korean headers to English equivalents.

Korean headers: ${JSON.stringify(headers)}

Standard English fields should be: date, product_name, product_code, quantity, unit_price, total_amount, customer_name, customer_id, sales_rep, region

Example output:
{"날짜": "date", "제품명": "product_name", "수량": "quantity"}
  `;
  
  const response = await callLLM(prompt);
  const cleanResponse = response.trim().replace(/```json\s*|```\s*$/g, '');
  return JSON.parse(cleanResponse);
};

// Date Format Standardization
const standardizeDate = (dateStr) => {
  if (!dateStr) return '';
  
  // Handle Excel date numbers (days since 1900-01-01)
  if (!isNaN(dateStr) && Number(dateStr) > 1) {
    const excelEpoch = new Date(1900, 0, 1);
    const date = new Date(excelEpoch.getTime() + (Number(dateStr) - 2) * 24 * 60 * 60 * 1000);
    return formatDateToDDMMYYYY(date);
  }
  
  // Try to parse various date formats
  const datePatterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,        // YYYY-MM-DD or YYYY-M-D
    /(\d{1,2})-(\d{1,2})-(\d{4})/,        // DD-MM-YYYY or D-M-YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,      // DD/MM/YYYY or MM/DD/YYYY
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,      // YYYY/MM/DD
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,      // DD.MM.YYYY
    /(\d{4})\.(\d{1,2})\.(\d{1,2})/       // YYYY.MM.DD
  ];
  
  const str = dateStr.toString().trim();
  
  for (let i = 0; i < datePatterns.length; i++) {
    const match = str.match(datePatterns[i]);
    if (match) {
      let day, month, year;
      
      if (i === 0 || i === 3 || i === 5) {
        // YYYY-MM-DD format
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else if (i === 1 || i === 4) {
        // DD-MM-YYYY format
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (i === 2) {
        // Ambiguous MM/DD/YYYY or DD/MM/YYYY - assume DD/MM/YYYY
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      }
      
      // Validate date components
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        continue;
      }
      
      // Create date object to validate
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return formatDateToDDMMYYYY(date);
      }
    }
  }
  
  // Try native Date parsing as fallback
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return formatDateToDDMMYYYY(date);
  }
  
  return dateStr; // Return original if can't parse
};

// Format date to DD-MM-YYYY
const formatDateToDDMMYYYY = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// Data Validation
const validateRecord = (record, rules) => {
  const errors = [];
  
  // Standardize date format
  if (record.date) {
    record.date = standardizeDate(record.date);
  }
  
  // Check required fields
  for (const field of rules.required_fields) {
    if (!record[field] || record[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check data types
  if (record.quantity && isNaN(Number(record.quantity))) {
    errors.push('Quantity must be numeric');
  }
  
  if (record.unit_price && isNaN(Number(record.unit_price))) {
    errors.push('Unit price must be numeric');
  }
  
  if (record.total_amount && isNaN(Number(record.total_amount))) {
    errors.push('Total amount must be numeric');
  }
  
  // Validate date format
  if (record.date && !record.date.match(/^\d{2}-\d{2}-\d{4}$/)) {
    errors.push('Date must be in DD-MM-YYYY format');
  }
  
  // Business rule: total = quantity * unit_price
  if (record.quantity && record.unit_price && record.total_amount) {
    const calculated = Number(record.quantity) * Number(record.unit_price);
    const actual = Number(record.total_amount);
    if (Math.abs(calculated - actual) > 0.01) {
      errors.push(`Total amount mismatch: ${calculated} vs ${actual}`);
    }
  }
  
  return errors;
};

// Process Excel Files
const processExcelFiles = async (files) => {
  await initPyodide();
  consolidatedData = [];
  exceptionRecords = [];
  fixHistory = [];
  
  const validationRules = {
    required_fields: ['date', 'product_name', 'quantity', 'unit_price', 'total_amount'],
    data_types: {
      quantity: 'numeric',
      unit_price: 'numeric',
      total_amount: 'numeric',
      date: 'date'
    }
  };
  
  for (let i = 0; i < files.length; i++) {
    updateStatus(`Processing file ${i + 1}/${files.length}: ${files[i].name}`);
    
    try {
      // Read Excel file
      const buffer = await files[i].arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      pyodide.globals.set('excel_data', uint8Array);
      pyodide.runPython(`
        import pandas as pd
        import io
        excel_file = io.BytesIO(bytes(excel_data))
        df = pd.read_excel(excel_file)
        headers = df.columns.tolist()
        data_json = df.to_json(orient='records')
      `);
      
      const headers = pyodide.globals.get('headers').toJs();
      const data = JSON.parse(pyodide.globals.get('data_json'));
      
      // Translate Korean headers
      updateStatus(`Translating headers for ${files[i].name}...`);
      const headerMapping = await translateHeaders(headers);
      
      // Process records
      for (const record of data) {
        const translatedRecord = {};
        
        // Map Korean fields to English
        for (const [koreanField, englishField] of Object.entries(headerMapping)) {
          translatedRecord[englishField] = record[koreanField];
        }
        
        // Add metadata
        translatedRecord._source_file = files[i].name;
        translatedRecord._processed_at = new Date().toISOString();
        
        // Validate record
        const errors = validateRecord(translatedRecord, validationRules);
        
        if (errors.length === 0) {
          consolidatedData.push(translatedRecord);
        } else {
          exceptionRecords.push({
            ...translatedRecord,
            _validation_errors: errors
          });
        }
      }
      
    } catch (error) {
      showAlert(`Error processing ${files[i].name}: ${error.message}`, 'danger');
    }
  }
  
  updateResults();
};

// Update Results Display
const updateResults = () => {
  document.getElementById('total-files').textContent = elements.excelFiles.files.length;
  document.getElementById('total-records').textContent = consolidatedData.length + exceptionRecords.length;
  document.getElementById('valid-records').textContent = consolidatedData.length;
  document.getElementById('exception-records').textContent = exceptionRecords.length;
  
  // Enable/disable export buttons based on exception status
  const hasExceptions = exceptionRecords.length > 0;
  const hasData = consolidatedData.length > 0;
  
  elements.exportData.disabled = hasExceptions || !hasData;
  elements.exportFixes.disabled = fixHistory.length === 0;
  
  // Update export button text and styling
  if (hasExceptions) {
    elements.exportData.innerHTML = '<i class="fas fa-lock me-2"></i>Export All Data (Fix Exceptions First)';
    elements.exportData.classList.remove('btn-primary');
    elements.exportData.classList.add('btn-secondary');
  } else if (hasData) {
    elements.exportData.innerHTML = '<i class="fas fa-download me-2"></i>Export All Data';
    elements.exportData.classList.remove('btn-secondary');
    elements.exportData.classList.add('btn-primary');
  } else {
    elements.exportData.innerHTML = '<i class="fas fa-download me-2"></i>Export All Data';
    elements.exportData.classList.remove('btn-primary');
    elements.exportData.classList.add('btn-secondary');
  }
  
  elements.resultsSection.classList.remove('d-none');
  
  if (exceptionRecords.length > 0) {
    displayExceptions();
  }
  
  if (fixHistory.length > 0) {
    displayFixHistory();
  }
  
  displayDataPreview();
};

// Display Exception Records
const displayExceptions = () => {
  const exceptionsSection = document.getElementById('exceptions-section');
  const exceptionsTable = document.getElementById('exceptions-table');
  
  if (exceptionRecords.length === 0) {
    exceptionsSection.classList.add('d-none');
    return;
  }
  
  exceptionsSection.classList.remove('d-none');
  
  const tableHtml = `
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead class="table-dark">
          <tr>
            <th>Source File</th>
            <th>Product Name</th>
            <th>Errors</th>
            <th>Actions</th>
          </tr>
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
                <button class="btn btn-sm btn-warning" onclick="fixRecord(${index})">
                  <i class="fas fa-wrench me-1"></i>Auto-fix
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  exceptionsTable.innerHTML = tableHtml;
};

// Display Fix History
const displayFixHistory = () => {
  const historySection = document.getElementById('fix-history-section');
  const historyContent = document.getElementById('fix-history-content');
  
  if (fixHistory.length === 0) {
    historySection.classList.add('d-none');
    return;
  }
  
  historySection.classList.remove('d-none');
  
  const historyHtml = fixHistory.map((fix, index) => {
    const changedFields = getChangedFields(fix.original, fix.fixed);
    
    return `
      <div class="card mb-3">
        <div class="card-header">
          <h6 class="mb-0">
            <i class="fas fa-file-excel me-2"></i>
            ${fix.original._source_file || 'Unknown file'} - Record ${index + 1}
            <span class="badge bg-success ms-2">${changedFields.length} changes</span>
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
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th class="text-danger">Original</th>
                      <th class="text-success">Fixed</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${changedFields.map(change => `
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
  
  historyContent.innerHTML = historyHtml;
};

// Get Changed Fields
const getChangedFields = (original, fixed) => {
  const changes = [];
  const allFields = new Set([...Object.keys(original), ...Object.keys(fixed)]);
  
  for (const field of allFields) {
    if (field.startsWith('_')) continue; // Skip metadata fields
    
    const originalValue = original[field];
    const fixedValue = fixed[field];
    
    if (originalValue !== fixedValue) {
      changes.push({
        field,
        original: originalValue,
        fixed: fixedValue
      });
    }
  }
  
  return changes;
};

// Display Data Preview
const displayDataPreview = () => {
  const preview = document.getElementById('data-preview');
  
  if (consolidatedData.length === 0) {
    preview.innerHTML = '<p class="text-muted">No valid data to display</p>';
    return;
  }
  
  const sampleData = consolidatedData.slice(0, 10);
  const fields = Object.keys(sampleData[0]).filter(key => !key.startsWith('_'));
  
  const tableHtml = `
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead class="table-dark">
          <tr>
            ${fields.map(field => `<th>${field}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${sampleData.map(record => `
            <tr>
              ${fields.map(field => `<td>${record[field] || ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${consolidatedData.length > 10 ? `<p class="text-muted mt-2">Showing 10 of ${consolidatedData.length} records</p>` : ''}
  `;
  
  preview.innerHTML = tableHtml;
};

// Auto-fix Record
window.fixRecord = async (index) => {
  if (!exceptionRecords[index]) {
    showAlert('Record not found', 'danger');
    return;
  }
  
  const record = exceptionRecords[index];
  showProcessing(true);
  updateStatus(`Auto-fixing record from ${record._source_file || 'unknown file'}...`);
  
  try {
    const prompt = `
Fix this sales record data. Fill missing values with reasonable defaults and correct any data type issues.
Return ONLY the corrected JSON record.

Original record: ${JSON.stringify(record)}
Errors: ${record._validation_errors ? record._validation_errors.join(', ') : 'Unknown errors'}

Rules:
- quantity, unit_price, total_amount must be numbers
- total_amount should equal quantity * unit_price
- date should be in DD-MM-YYYY format (convert from any format)
- Fill missing required fields with reasonable defaults
    `;
    
    const response = await callLLM(prompt);
    const cleanResponse = response.trim().replace(/```json\s*|```\s*$/g, '');
    const fixedRecord = JSON.parse(cleanResponse);
    
    // Add metadata if missing
    fixedRecord._source_file = record._source_file || 'unknown';
    fixedRecord._processed_at = new Date().toISOString();
    
    // Store fix history
    fixHistory.push({
      original: { ...record },
      fixed: { ...fixedRecord },
      timestamp: new Date().toISOString()
    });
    
    // Remove from exceptions and add to valid data
    exceptionRecords.splice(index, 1);
    consolidatedData.push(fixedRecord);
    
    updateResults();
    showAlert('Record fixed successfully!', 'success');
    
  } catch (error) {
    showAlert(`Error fixing record: ${error.message}`, 'danger');
  } finally {
    showProcessing(false);
  }
};

// Export All Consolidated Data
const exportConsolidatedData = () => {
  if (consolidatedData.length === 0) {
    showAlert('No data to export', 'warning');
    return;
  }
  
  // Add metadata columns to show which records were fixed
  const dataWithMetadata = consolidatedData.map(record => {
    const wasFixed = fixHistory.some(fix => 
      fix.fixed._source_file === record._source_file && 
      fix.fixed._processed_at === record._processed_at
    );
    
    return {
      ...record,
      _was_auto_fixed: wasFixed ? 'Yes' : 'No',
      _fix_timestamp: wasFixed ? 
        fixHistory.find(fix => 
          fix.fixed._source_file === record._source_file && 
          fix.fixed._processed_at === record._processed_at
        )?.timestamp : ''
    };
  });
  
  const csv = convertToCSV(dataWithMetadata);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `consolidated_sales_data_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  const fixedCount = dataWithMetadata.filter(r => r._was_auto_fixed === 'Yes').length;
  showAlert(`Data exported successfully! ${consolidatedData.length} total records (${fixedCount} auto-fixed)`, 'success');
};

// Export Fix History
const exportFixHistory = () => {
  if (fixHistory.length === 0) {
    showAlert('No fix history to export', 'warning');
    return;
  }
  
  // Create detailed fix history CSV
  const fixData = [];
  
  fixHistory.forEach((fix, index) => {
    const changes = getChangedFields(fix.original, fix.fixed);
    const errors = fix.original._validation_errors || [];
    
    // Add summary row
    fixData.push({
      record_number: index + 1,
      source_file: fix.original._source_file || 'Unknown',
      fix_timestamp: fix.timestamp,
      original_errors: errors.join('; '),
      changes_made: changes.length,
      field_changed: '',
      original_value: '',
      fixed_value: '',
      change_type: 'SUMMARY'
    });
    
    // Add detail rows for each changed field
    changes.forEach(change => {
      fixData.push({
        record_number: index + 1,
        source_file: fix.original._source_file || 'Unknown',
        fix_timestamp: fix.timestamp,
        original_errors: '',
        changes_made: '',
        field_changed: change.field,
        original_value: change.original || '',
        fixed_value: change.fixed || '',
        change_type: 'FIELD_CHANGE'
      });
    });
  });
  
  const csv = convertToCSV(fixData);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `fix_history_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showAlert(`Fix history exported successfully! ${fixHistory.length} records fixed`, 'success');
};

// CSV Conversion
const convertToCSV = (data) => {
  if (data.length === 0) return '';
  
  const fields = Object.keys(data[0]).filter(key => !key.startsWith('_'));
  const header = fields.join(',');
  const rows = data.map(record => 
    fields.map(field => `"${(record[field] || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  
  return [header, ...rows].join('\n');
};

// Event Listeners
elements.saveConfig.addEventListener('click', config.save);

elements.excelFiles.addEventListener('change', () => {
  elements.processFiles.disabled = elements.excelFiles.files.length === 0;
});

elements.processFiles.addEventListener('click', async () => {
  const cfg = config.get();
  if (!cfg.apiKey) {
    showAlert('Please configure API key first', 'warning');
    return;
  }
  
  showProcessing(true);
  try {
    await processExcelFiles(elements.excelFiles.files);
    showAlert('Files processed successfully!', 'success');
  } catch (error) {
    showAlert(`Processing failed: ${error.message}`, 'danger');
  } finally {
    showProcessing(false);
  }
});

elements.exportData.addEventListener('click', exportConsolidatedData);
elements.exportFixes.addEventListener('click', exportFixHistory);

// Handle provider dropdown change
elements.llmProvider.addEventListener('change', (e) => {
  const provider = e.target.value;
  if (provider === 'openai') {
    elements.baseUrl.value = 'https://api.openai.com/v1';
    elements.llmModel.value = 'gpt-4.1-mini';
  } else if (provider === 'custom') {
    elements.baseUrl.value = 'https://llmfoundry.straive.com/v1';
    elements.llmModel.value = 'gpt-4.1-mini';
  }
});

// Auto-fix All Records
elements.autoFixAll.addEventListener('click', async () => {
  if (exceptionRecords.length === 0) {
    showAlert('No exceptions to fix', 'info');
    return;
  }
  
  const cfg = config.get();
  if (!cfg.apiKey) {
    showAlert('Please configure API key first', 'warning');
    return;
  }
  
  const totalRecords = exceptionRecords.length;
  showProcessing(true);
  
  try {
    for (let i = exceptionRecords.length - 1; i >= 0; i--) {
      updateStatus(`Auto-fixing record ${totalRecords - i}/${totalRecords}...`);
      
      const record = exceptionRecords[i];
      const prompt = `
Fix this sales record data. Fill missing values with reasonable defaults and correct any data type issues.
Return ONLY the corrected JSON record.

Original record: ${JSON.stringify(record)}
Errors: ${record._validation_errors ? record._validation_errors.join(', ') : 'Unknown errors'}

Rules:
- quantity, unit_price, total_amount must be numbers
- total_amount should equal quantity * unit_price
- date should be in DD-MM-YYYY format (convert from any format)
- Fill missing required fields with reasonable defaults
      `;
      
      try {
        const response = await callLLM(prompt);
        const cleanResponse = response.trim().replace(/```json\s*|```\s*$/g, '');
        const fixedRecord = JSON.parse(cleanResponse);
        
        // Add metadata if missing
        fixedRecord._source_file = record._source_file || 'unknown';
        fixedRecord._processed_at = new Date().toISOString();
        
        // Store fix history
        fixHistory.push({
          original: { ...record },
          fixed: { ...fixedRecord },
          timestamp: new Date().toISOString()
        });
        
        // Remove from exceptions and add to valid data
        exceptionRecords.splice(i, 1);
        consolidatedData.push(fixedRecord);
        
      } catch (error) {
        console.error(`Failed to fix record ${i}:`, error);
        showAlert(`Failed to fix record from ${record._source_file || 'unknown'}: ${error.message}`, 'warning');
      }
    }
    
    updateResults();
    
    // Show success message with additional info about cleared exceptions
    if (exceptionRecords.length === 0) {
      showAlert(`Successfully fixed all ${totalRecords} records! Exception section cleared.`, 'success');
    } else {
      showAlert(`Fixed ${totalRecords - exceptionRecords.length} of ${totalRecords} records. ${exceptionRecords.length} exceptions remain.`, 'warning');
    }
    
  } catch (error) {
    showAlert(`Auto-fix failed: ${error.message}`, 'danger');
  } finally {
    showProcessing(false);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  config.load();
  
  // Show configuration section only if not configured
  const cfg = config.get();
  if (!cfg.configured || !cfg.apiKey) {
    const bsCollapse = new bootstrap.Collapse(elements.configBody, { toggle: false });
    bsCollapse.show();
  }
  
  // Handle chevron rotation
  elements.configBody.addEventListener('shown.bs.collapse', () => {
    elements.configChevron.classList.remove('fa-chevron-down');
    elements.configChevron.classList.add('fa-chevron-up');
  });
  
  elements.configBody.addEventListener('hidden.bs.collapse', () => {
    elements.configChevron.classList.remove('fa-chevron-up');
    elements.configChevron.classList.add('fa-chevron-down');
  });
});