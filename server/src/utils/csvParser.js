/**
 * CSV Parser and Sanitizer Utility for EduConnect
 * 
 * Provides robust RFC 4180-compliant CSV parsing:
 * - Supports quoted fields with commas, line breaks, and escaped quotes ("")
 * - Case-insensitive and alias-aware header mapping
 * - Sanitizes cells against CSV Formula Injection (CWE-1236)
 */

/**
 * Parses raw CSV string into array of rows (string arrays)
 * 
 * @param {string} text - Raw CSV text
 * @returns {Array<Array<string>>} 2D array of rows and columns
 */
function parseCsvRows(text) {
  if (!text || typeof text !== 'string') return [];

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;

  // Normalize line endings
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        // Only push non-empty rows
        if (currentRow.some(c => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  // Push final cell/row if remaining
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Maps common CSV column names to canonical Opportunity fields
 */
const HEADER_ALIASES = {
  title: ['title', 'name', 'opportunity_title', 'opportunity', 'headline'],
  organization: ['organization', 'company', 'provider', 'host', 'institution', 'org'],
  type: ['type', 'opportunity_type', 'category', 'stream'],
  description: ['description', 'desc', 'details', 'about', 'overview'],
  deadline: ['deadline', 'last_date', 'due_date', 'closing_date', 'end_date'],
  applicationUrl: ['application_url', 'applicationurl', 'official_url', 'officialurl', 'url', 'link', 'apply_url'],
  location: ['location', 'city', 'place', 'venue'],
  mode: ['mode', 'work_type', 'worktype', 'format'],
  skills: ['skills', 'required_skills', 'tech_stack', 'prerequisites'],
  department: ['department', 'departments', 'eligible_departments', 'branches'],
  minCGPA: ['min_cgpa', 'mincgpa', 'cgpa', 'minimum_cgpa', 'cutoff'],
  minYear: ['min_year', 'minyear', 'year', 'eligible_years'],
  stipendOrReward: ['stipend', 'reward', 'stipendorreward', 'prize', 'grant', 'amount'],
  externalApplicantCount: ['external_applicants', 'external_applicant_count', 'applicant_count', 'applicants_count', 'applicants', 'registered_count']
};

/**
 * Normalizes a header string and finds its canonical schema field
 */
function matchCanonicalField(rawHeader) {
  const norm = (rawHeader || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').trim();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(norm) || canonical.toLowerCase() === norm) {
      return canonical;
    }
  }
  return null;
}

/**
 * Sanitizes cell text to protect against formula injection when viewed in spreadsheets
 */
function sanitizeFormulaInjection(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    // Allow legitimate signed numbers
    if (/^[+\-]\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    // Prefix with apostrophe to disarm spreadsheet formulas
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Parses raw CSV text into mapped, normalized row objects
 * 
 * @param {string} csvText - Raw CSV content
 * @returns {{ headers: Array<string>, rows: Array<Object>, totalRows: number, unmappedHeaders: Array<string> }}
 */
function parseAndMapCsv(csvText) {
  const parsedRows = parseCsvRows(csvText);
  if (parsedRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0, unmappedHeaders: [] };
  }

  const headerRow = parsedRows[0];
  const fieldMapping = [];
  const unmappedHeaders = [];

  headerRow.forEach((colName, index) => {
    const canonical = matchCanonicalField(colName);
    if (canonical) {
      fieldMapping.push({ index, field: canonical });
    } else {
      unmappedHeaders.push(colName);
    }
  });

  const dataRows = [];
  for (let r = 1; r < parsedRows.length; r++) {
    const rawRow = parsedRows[r];
    const rowObj = { _rowNumber: r + 1 }; // 1-indexed (with header as row 1)

    fieldMapping.forEach(({ index, field }) => {
      const rawVal = rawRow[index] !== undefined ? rawRow[index] : '';
      rowObj[field] = sanitizeFormulaInjection(rawVal);
    });

    dataRows.push(rowObj);
  }

  return {
    headers: headerRow,
    rows: dataRows,
    totalRows: dataRows.length,
    unmappedHeaders
  };
}

module.exports = {
  parseCSV: parseCsvRows,
  parseCsvRows,
  parseAndMapCsv,
  sanitizeFormulaInjection,
  matchCanonicalField
};
