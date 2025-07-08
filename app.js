// Main Application Module
import { config } from './config.js';
import { DataProcessor } from './data-processor.js';
import { LLMClient } from './llm-client.js';
import { UIManager } from './ui-manager.js';

class SalesUnifier {
  constructor() {
    this.processor = new DataProcessor();
    this.ui = new UIManager();
    this.llmClient = null;
    this.data = { consolidated: [], exceptions: [], fixHistory: [] };
    this.validationRules = {
      required_fields: ['date', 'product_name', 'quantity', 'unit_price', 'total_amount']
    };
    this.setupEventHandlers();
    this.initialize();
  }

  setupEventHandlers() {
    this.ui.elements.saveconfig.addEventListener('click', () => this.saveConfig());
    this.ui.elements.processfiles.addEventListener('click', () => this.processFiles());
    this.ui.elements.loadsampledata.addEventListener('click', () => this.loadSampleData());
    this.ui.elements.exportdata.addEventListener('click', () => this.exportData());
    this.ui.elements.exportfixes.addEventListener('click', () => this.exportFixHistory());
    this.ui.elements.autofixall.addEventListener('click', () => this.autoFixAll());
    
    // Global fix function for individual records
    window.fixRecord = (index) => this.fixRecord(index);
  }

  initialize() {
    const cfg = config.load();
    const defaults = config.getDefaults();
    
    ['provider', 'model', 'apiKey', 'baseUrl'].forEach(key => {
      const element = this.ui.elements[key === 'baseUrl' ? 'baseurl' : (key === 'apiKey' ? 'apikey' : key === 'model' ? 'llmmodel' : 'llmprovider')];
      element.value = cfg[key] || defaults[key === 'baseUrl' ? 'url' : key] || '';
    });
    
    this.ui.initializeConfig(cfg);
  }

  saveConfig() {
    const cfg = {
      provider: this.ui.elements.llmprovider.value,
      model: this.ui.elements.llmmodel.value,
      apiKey: this.ui.elements.apikey.value,
      baseUrl: this.ui.elements.baseurl.value
    };
    
    config.save(cfg);
    this.ui.showAlert('Configuration saved successfully!', 'success');
    
    const bsCollapse = new bootstrap.Collapse(this.ui.elements.llmconfigbody, { toggle: false });
    bsCollapse.hide();
  }

  async loadSampleData() {
    const cfg = config.load();
    if (!cfg.apiKey) {
      this.ui.showAlert('Please configure API key first', 'warning');
      return;
    }

    this.ui.showAlert('Loading sample data...', 'info');
    this.ui.showProcessing(true);
    
    try {
      // Fetch the sample Excel file
      const response = await fetch('./sampledata.xlsx');
      if (!response.ok) throw new Error('Sample file not found');
      
      const blob = await response.blob();
      const file = new File([blob], 'sampledata.xlsx', { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Process the sample file using the same logic as regular file processing
      this.llmClient = new LLMClient(cfg);
      this.data = { consolidated: [], exceptions: [], fixHistory: [] };
      
      this.ui.updateStatus('Processing sample file...');
      
      const { headers, data } = await this.processor.readExcelFile(file);
      this.ui.updateStatus('Translating Korean headers...');
      const headerMapping = await this.llmClient.translateHeaders(headers);
      
      data.forEach(record => {
        const translatedRecord = this.translateRecord(record, headerMapping, 'sampledata.xlsx');
        const errors = this.processor.validateRecord(translatedRecord, this.validationRules);
        
        if (errors.length === 0) {
          this.data.consolidated.push(translatedRecord);
        } else {
          this.data.exceptions.push({ ...translatedRecord, _validation_errors: errors });
        }
      });
      
      this.updateResults();
      this.ui.showAlert('Sample data loaded and processed successfully!', 'success');
      
    } catch (error) {
      this.ui.showAlert(`Failed to load sample data: ${error.message}`, 'danger');
    } finally {
      this.ui.showProcessing(false);
    }
  }

  async processFiles() {
    const cfg = config.load();
    if (!cfg.apiKey) {
      this.ui.showAlert('Please configure API key first', 'warning');
      return;
    }

    this.llmClient = new LLMClient(cfg);
    this.data = { consolidated: [], exceptions: [], fixHistory: [] };
    
    this.ui.showProcessing(true);
    
    try {
      const files = Array.from(this.ui.elements.excelfiles.files);
      
      for (const [index, file] of files.entries()) {
        this.ui.updateStatus(`Processing file ${index + 1}/${files.length}: ${file.name}`);
        
        try {
          const { headers, data } = await this.processor.readExcelFile(file);
          this.ui.updateStatus(`Translating headers for ${file.name}...`);
          const headerMapping = await this.llmClient.translateHeaders(headers);
          
          data.forEach(record => {
            const translatedRecord = this.translateRecord(record, headerMapping, file.name);
            const errors = this.processor.validateRecord(translatedRecord, this.validationRules);
            
            if (errors.length === 0) {
              this.data.consolidated.push(translatedRecord);
            } else {
              this.data.exceptions.push({ ...translatedRecord, _validation_errors: errors });
            }
          });
        } catch (error) {
          this.ui.showAlert(`Error processing ${file.name}: ${error.message}`, 'danger');
        }
      }
      
      this.updateResults();
      this.ui.showAlert('Files processed successfully!', 'success');
    } catch (error) {
      this.ui.showAlert(`Processing failed: ${error.message}`, 'danger');
    } finally {
      this.ui.showProcessing(false);
    }
  }

  translateRecord(record, headerMapping, fileName) {
    const translated = {};
    Object.entries(headerMapping).forEach(([korean, english]) => {
      translated[english] = record[korean];
    });
    translated._source_file = fileName;
    translated._processed_at = new Date().toISOString();
    return translated;
  }

  async fixRecord(index) {
    if (!this.data.exceptions[index]) {
      this.ui.showAlert('Record not found', 'danger');
      return;
    }

    const record = this.data.exceptions[index];
    this.ui.showProcessing(true);
    this.ui.updateStatus(`Auto-fixing record from ${record._source_file || 'unknown file'}...`);

    try {
      const fixedRecord = await this.llmClient.fixRecord(record);
      fixedRecord._source_file = record._source_file || 'unknown';
      fixedRecord._processed_at = new Date().toISOString();

      this.data.fixHistory.push({
        original: { ...record },
        fixed: { ...fixedRecord },
        timestamp: new Date().toISOString()
      });

      this.data.exceptions.splice(index, 1);
      this.data.consolidated.push(fixedRecord);

      this.updateResults();
      this.ui.showAlert('Record fixed successfully!', 'success');
    } catch (error) {
      this.ui.showAlert(`Error fixing record: ${error.message}`, 'danger');
    } finally {
      this.ui.showProcessing(false);
    }
  }

  async autoFixAll() {
    if (this.data.exceptions.length === 0) {
      this.ui.showAlert('No exceptions to fix', 'info');
      return;
    }

    const cfg = config.load();
    if (!cfg.apiKey) {
      this.ui.showAlert('Please configure API key first', 'warning');
      return;
    }

    const totalRecords = this.data.exceptions.length;
    this.ui.showProcessing(true);

    try {
      for (let i = this.data.exceptions.length - 1; i >= 0; i--) {
        this.ui.updateStatus(`Auto-fixing record ${totalRecords - i}/${totalRecords}...`);
        
        try {
          const record = this.data.exceptions[i];
          const fixedRecord = await this.llmClient.fixRecord(record);
          
          fixedRecord._source_file = record._source_file || 'unknown';
          fixedRecord._processed_at = new Date().toISOString();

          this.data.fixHistory.push({
            original: { ...record },
            fixed: { ...fixedRecord },
            timestamp: new Date().toISOString()
          });

          this.data.exceptions.splice(i, 1);
          this.data.consolidated.push(fixedRecord);
        } catch (error) {
          console.error(`Failed to fix record ${i}:`, error);
          this.ui.showAlert(`Failed to fix record: ${error.message}`, 'warning');
        }
      }

      this.updateResults();
      
      const message = this.data.exceptions.length === 0 
        ? `Successfully fixed all ${totalRecords} records! Exception section cleared.`
        : `Fixed ${totalRecords - this.data.exceptions.length} of ${totalRecords} records. ${this.data.exceptions.length} exceptions remain.`;
      
      this.ui.showAlert(message, this.data.exceptions.length === 0 ? 'success' : 'warning');
    } catch (error) {
      this.ui.showAlert(`Auto-fix failed: ${error.message}`, 'danger');
    } finally {
      this.ui.showProcessing(false);
    }
  }

  updateResults() {
    this.ui.updateResults(this.data.consolidated, this.data.exceptions, this.data.fixHistory);
    
    if (this.data.exceptions.length > 0) this.ui.displayExceptions(this.data.exceptions);
    if (this.data.fixHistory.length > 0) this.ui.displayFixHistory(this.data.fixHistory);
    
    this.ui.displayDataPreview(this.data.consolidated);
  }

  exportData() {
    if (this.data.consolidated.length === 0) {
      this.ui.showAlert('No data to export', 'warning');
      return;
    }

    const dataWithMetadata = this.data.consolidated.map(record => ({
      ...record,
      _was_auto_fixed: this.data.fixHistory.some(fix => 
        fix.fixed._source_file === record._source_file && 
        fix.fixed._processed_at === record._processed_at
      ) ? 'Yes' : 'No'
    }));

    this.downloadCSV(dataWithMetadata, 'consolidated_sales_data');
    
    const fixedCount = dataWithMetadata.filter(r => r._was_auto_fixed === 'Yes').length;
    this.ui.showAlert(`Data exported successfully! ${this.data.consolidated.length} total records (${fixedCount} auto-fixed)`, 'success');
  }

  exportFixHistory() {
    if (this.data.fixHistory.length === 0) {
      this.ui.showAlert('No fix history to export', 'warning');
      return;
    }

    const fixData = this.data.fixHistory.flatMap((fix, index) => {
      const changes = this.ui.getChangedFields(fix.original, fix.fixed);
      const summary = {
        record_number: index + 1,
        source_file: fix.original._source_file || 'Unknown',
        fix_timestamp: fix.timestamp,
        original_errors: fix.original._validation_errors?.join('; ') || '',
        changes_made: changes.length,
        change_type: 'SUMMARY'
      };

      const details = changes.map(change => ({
        record_number: index + 1,
        source_file: fix.original._source_file || 'Unknown',
        fix_timestamp: fix.timestamp,
        field_changed: change.field,
        original_value: change.original || '',
        fixed_value: change.fixed || '',
        change_type: 'FIELD_CHANGE'
      }));

      return [summary, ...details];
    });

    this.downloadCSV(fixData, 'fix_history');
    this.ui.showAlert(`Fix history exported successfully! ${this.data.fixHistory.length} records fixed`, 'success');
  }

  downloadCSV(data, filename) {
    if (data.length === 0) return;
    
    const fields = Object.keys(data[0]).filter(key => !key.startsWith('_') || key.includes('auto_fixed') || key.includes('timestamp'));
    const header = fields.join(',');
    const rows = data.map(record => 
      fields.map(field => `"${(record[field] || '').toString().replace(/"/g, '""')}"`).join(',')
    );
    
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => new SalesUnifier());