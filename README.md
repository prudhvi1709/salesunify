# Excel Sales Data Consolidator

AI-powered browser-based tool for consolidating Korean Excel sales data with zero exceptions.

## Features

- **Korean Header Translation**: Automatic translation of Korean Excel headers to standardized English fields
- **AI Validation & Auto-Fix**: LLM-powered data validation with intelligent error correction
- **Universal Date Standardization**: Converts any date format to DD-MM-YYYY automatically
- **Zero Exception Goal**: Bulk auto-fix functionality for all data inconsistencies
- **Multi-Provider LLM**: Support for OpenAI and custom LLM providers with collapsible configuration
- **Browser-Based**: Runs entirely in browser using Pyodide (no server required)
- **Comprehensive Export Options**: Multiple CSV export formats with complete audit trails
- **Fix History Tracking**: Detailed before/after comparison of all AI corrections

## Usage

### 1. **Initial Setup (First Time Only)**
- Configuration panel automatically opens on first visit
- Select LLM provider (OpenAI or custom)
- Enter API key and base URL
- Save configuration (panel auto-collapses and stays hidden)

### 2. **Process Excel Files**
- Upload multiple Excel files with Korean headers
- Click "Process Files" to start consolidation
- Watch real-time processing status

### 3. **Handle Exceptions**
- **Individual Fix**: Click "Auto-fix" on specific problematic records
- **Bulk Fix**: Click "Auto-fix All Exceptions" to process all at once
- Exception section automatically disappears when all records are fixed

### 4. **Review Changes**
- **Fix History**: See detailed before/after comparison of all AI changes
- **Field-by-field**: View exactly what was changed and why
- **Error Tracking**: Original validation errors clearly displayed

### 5. **Export Data**
- **"Export All Data"**: Complete consolidated dataset with fix indicators
  - Includes `_was_auto_fixed` and `_fix_timestamp` columns
  - Shows statistics of total vs auto-fixed records
- **"Export Fix History"**: Detailed audit trail of all changes
  - Summary and field-level change tracking
  - Perfect for compliance and review purposes

## Data Transformations

### Date Format Standardization
Automatically converts any input format to **DD-MM-YYYY**:
- Excel date numbers (44927 → 01-01-2023)
- ISO formats (2023-01-15 → 15-01-2023)
- Various separators (15/01/2023, 15.01.2023)
- Mixed formats handled intelligently

### Supported Korean Fields
Standard sales data field mappings:
- 날짜 → date (DD-MM-YYYY format)
- 제품명 → product_name
- 제품코드 → product_code
- 수량 → quantity (numeric)
- 단가 → unit_price (numeric)
- 총액 → total_amount (numeric, validated against quantity × unit_price)
- 고객명 → customer_name
- 고객ID → customer_id
- 영업담당자 → sales_rep
- 지역 → region

## Export File Formats

### Consolidated Data CSV
```csv
date,product_name,quantity,unit_price,total_amount,_was_auto_fixed,_fix_timestamp
15-01-2023,Product A,10,5.00,50.00,Yes,2024-01-15T10:30:00Z
16-01-2023,Product B,5,10.00,50.00,No,
```

### Fix History CSV  
```csv
record_number,source_file,fix_timestamp,original_errors,field_changed,original_value,fixed_value
1,sales_data.xlsx,2024-01-15T10:30:00Z,Missing date; Invalid quantity,date,,15-01-2023
1,sales_data.xlsx,2024-01-15T10:30:00Z,,quantity,abc,10
```

## Architecture

- **Frontend**: Modern JavaScript with Bootstrap UI and collapsible sections
- **Python Processing**: Pyodide for Excel processing in browser
- **LLM Integration**: Configurable API endpoints with response cleaning
- **Smart UI**: Auto-hiding sections, progress tracking, bulk operations
- **Data Persistence**: Browser local storage for configuration

## File Structure

```
├── index.html          # Main application interface with collapsible config
├── app.js              # Core application logic with auto-fix and export features
└── README.md           # This documentation
```

## Technical Highlights

- **No Server Required**: Complete browser-based solution
- **Intelligent Date Parsing**: Handles Excel numbers, multiple formats, Korean locale
- **Bulk Processing**: Auto-fix all exceptions with progress tracking
- **Audit Trail**: Complete change history with field-level details
- **Smart UI**: Sections auto-hide/show based on data state
- **Error Recovery**: Graceful handling of individual record failures
- **Export Options**: Multiple CSV formats for different use cases

## Sample Data Processing Flow

```mermaid
flowchart TD
    A[Click "Load Sample Data"] --> B{API Key Configured?}
    B -->|No| C[Show Warning: Configure API First]
    B -->|Yes| D[Fetch sampledata.xlsx]
    D --> E[Read Excel with Pyodide]
    E --> F[Translate Korean Headers via LLM]
    F --> G[Validate Each Record]
    G --> H[Separate Valid vs Exception Records]
    H --> I[Show Results Dashboard]
    I --> J[Ready for Auto-Fix Testing!]
    
    style A fill:#e1f5fe
    style J fill:#e8f5e8
    style C fill:#ffebee
```

## Getting Started

### Quick Demo
1. Open `index.html` in a modern web browser
2. Configure LLM provider (first time only - panel auto-opens)
3. Click **"Load Sample Data"** for instant demonstration
4. Test auto-fix functionality on the loaded exceptions
5. Export results to see the complete workflow

### Production Use
1. Upload Korean Excel files and click "Process Files"
2. Use "Auto-fix All" for bulk correction of exceptions
3. Review changes in Fix History section
4. Export consolidated data or detailed change log

Perfect for teams processing Korean sales data who need standardized reporting with complete transparency and audit trails for all AI-driven corrections.