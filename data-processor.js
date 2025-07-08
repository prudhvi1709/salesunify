// Data Processing Module
export class DataProcessor {
  constructor() {
    this.pyodide = null;
  }

  async initPyodide() {
    if (this.pyodide) return this.pyodide;
    
    this.pyodide = await loadPyodide();
    await this.pyodide.loadPackage(['pandas', 'micropip']);
    await this.pyodide.runPython('import micropip');
    await this.pyodide.runPythonAsync('await micropip.install("openpyxl")');
    await this.pyodide.runPython('import pandas as pd; import io');
    
    return this.pyodide;
  }

  standardizeDate(dateStr) {
    if (!dateStr) return '';
    
    // Excel date numbers
    if (!isNaN(dateStr) && Number(dateStr) > 1) {
      const excelEpoch = new Date(1900, 0, 1);
      const date = new Date(excelEpoch.getTime() + (Number(dateStr) - 2) * 24 * 60 * 60 * 1000);
      return this.formatDate(date);
    }

    // Date patterns with handlers
    const patterns = [
      { regex: /(\d{4})-(\d{1,2})-(\d{1,2})/, handler: (m) => [m[3], m[2], m[1]] },
      { regex: /(\d{1,2})-(\d{1,2})-(\d{4})/, handler: (m) => [m[1], m[2], m[3]] },
      { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, handler: (m) => [m[1], m[2], m[3]] },
      { regex: /(\d{4})\/(\d{1,2})\/(\d{1,2})/, handler: (m) => [m[3], m[2], m[1]] },
      { regex: /(\d{1,2})\.(\d{1,2})\.(\d{4})/, handler: (m) => [m[1], m[2], m[3]] },
      { regex: /(\d{4})\.(\d{1,2})\.(\d{1,2})/, handler: (m) => [m[3], m[2], m[1]] }
    ];

    for (const { regex, handler } of patterns) {
      const match = dateStr.toString().trim().match(regex);
      if (!match) continue;
      
      const [day, month, year] = handler(match).map(Number);
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) continue;
      
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day)
        return this.formatDate(date);
    }

    // Fallback to native parsing
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? this.formatDate(date) : dateStr;
  }

  formatDate(date) {
    return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
      .map(n => String(n).padStart(2, '0')).join('-');
  }

  validateRecord(record, rules) {
    const errors = [];
    
    // Standardize date
    if (record.date) record.date = this.standardizeDate(record.date);
    
    // Check required fields
    rules.required_fields.forEach(field => {
      if (!record[field] || record[field] === '') errors.push(`Missing required field: ${field}`);
    });

    // Numeric validation
    ['quantity', 'unit_price', 'total_amount'].forEach(field => {
      if (record[field] && isNaN(Number(record[field]))) errors.push(`${field} must be numeric`);
    });

    // Date format validation
    if (record.date && !record.date.match(/^\d{2}-\d{2}-\d{4}$/))
      errors.push('Date must be in DD-MM-YYYY format');

    // Business rule validation
    if (record.quantity && record.unit_price && record.total_amount) {
      const calculated = Number(record.quantity) * Number(record.unit_price);
      const actual = Number(record.total_amount);
      if (Math.abs(calculated - actual) > 0.01)
        errors.push(`Total amount mismatch: ${calculated} vs ${actual}`);
    }

    return errors;
  }

  async readExcelFile(file) {
    await this.initPyodide();
    
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    this.pyodide.globals.set('excel_data', uint8Array);
    this.pyodide.runPython(`
      excel_file = io.BytesIO(bytes(excel_data))
      df = pd.read_excel(excel_file)
      headers = df.columns.tolist()
      data_json = df.to_json(orient='records')
    `);
    
    return {
      headers: this.pyodide.globals.get('headers').toJs(),
      data: JSON.parse(this.pyodide.globals.get('data_json'))
    };
  }
}