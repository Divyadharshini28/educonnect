import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const SAMPLE_CSV = `title,organization,type,deadline,location,description,stipendOrReward,officialUrl,department,minYear,minCGPA,skills
"Machine Learning Research Fellowship","AI Institute of Tech","internship","2026-11-30","Bengaluru","Work on applied LLMs and transformer architectures.","₹40,000 / month","https://example.com/fellowship","Computer Science;MCA",2,7.5,"Python;PyTorch;NLP"
"Global Cloud Computing Hackathon","Cloud Foundation","hackathon","2026-12-15","Remote","Build distributed applications on Kubernetes.","\$10,000 Prize Pool","https://example.com/hackathon","All",1,6.0,"Docker;Go;Kubernetes"`;

export default function AdminCsvImportPage() {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result || '');
    };
    reader.onerror = () => {
      setError('Failed to read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!csvText.trim()) {
      setError('Please provide CSV content or select a file to import.');
      return;
    }

    setLoading(true);
    setError('');
    setReport(null);

    try {
      const res = await api.post('/opportunities/import', {
        csvContent: csvText
      });

      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete CSV import.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => {
    setCsvText(SAMPLE_CSV);
    setFileName('sample_opportunities.csv');
  };

  return (
    <div className="max-w-[768px] mx-auto px-4 py-10 text-ink">
      {/* Return link */}
      <div className="mb-6">
        <Link
          to="/admin/opportunities"
          className="text-sm text-muted hover:text-ink underline decoration-line underline-offset-2 font-medium"
        >
          ← Return to opportunities directory
        </Link>
      </div>

      <div className="pb-6 border-b border-line">
        <span className="text-xs font-semibold text-accent uppercase tracking-wider">
          Bulk Data Ingestion
        </span>
        <h1 className="font-serif text-3xl font-semibold text-ink mt-1">
          Import Opportunities via CSV
        </h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Upload or paste comma-separated opportunity records. The ingestion engine validates every row, sanitizes against spreadsheet formula injection, detects duplicates by title and organization, and generates an itemized verification log.
        </p>
      </div>

      {error && (
        <div className="my-4 p-3.5 rounded text-sm bg-rose-50 border border-rose-200 text-rose-800">
          {error}
        </div>
      )}

      {/* CSV Guidance Box */}
      <div className="my-6 p-4 rounded bg-canvas border border-line text-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-ink uppercase tracking-wider text-xs">
            Expected Columns & Header Format
          </span>
          <button
            type="button"
            onClick={loadSample}
            className="text-accent hover:underline font-medium text-xs sm:text-sm"
          >
            Load Sample Template
          </button>
        </div>
        <p className="text-muted leading-relaxed text-xs sm:text-sm">
          Required: <code className="text-ink font-mono font-semibold">title</code>, <code className="text-ink font-mono font-semibold">description</code>, <code className="text-ink font-mono font-semibold">type</code> (internship, hackathon, scholarship, certification, workshop, competition, placement).<br />
          Optional: <code className="text-ink font-mono">organization</code>, <code className="text-ink font-mono">deadline</code> (YYYY-MM-DD), <code className="text-ink font-mono">location</code>, <code className="text-ink font-mono">stipendOrReward</code>, <code className="text-ink font-mono">officialUrl</code>, <code className="text-ink font-mono">department</code>, <code className="text-ink font-mono">minYear</code>, <code className="text-ink font-mono">minCGPA</code>, <code className="text-ink font-mono">skills</code> (semicolon or comma separated).
        </p>
      </div>

      {/* Import Form */}
      <form onSubmit={handleImportSubmit} className="space-y-4">
        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink mb-2">
            Select CSV File from Disk
          </label>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-line file:text-sm file:bg-paper hover:file:bg-canvas file:cursor-pointer"
            />
            {fileName && <span className="text-sm text-muted">Loaded: {fileName}</span>}
          </div>
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink mb-1.5">
            Or Paste Raw CSV Data
          </label>
          <textarea
            rows={10}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="title,organization,type,deadline,location,description..."
            className="w-full font-mono text-sm p-3.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center justify-between pt-2 text-sm">
          <Link
            to="/admin/opportunities"
            className="text-muted hover:text-ink underline decoration-line font-medium"
          >
            Cancel and Return
          </Link>
          <button
            type="submit"
            disabled={loading || !csvText.trim()}
            className={`px-5 py-2.5 text-sm rounded font-medium transition-colors ${
              loading || !csvText.trim()
                ? 'bg-line text-muted cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent-hover'
            }`}
          >
            {loading ? 'Validating and Importing...' : 'Execute CSV Import'}
          </button>
        </div>
      </form>

      {/* Import Outcome Report */}
      {report && (
        <div className="mt-8 pt-6 border-t border-line space-y-6">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Ingestion Result Summary
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-sm">
            <div className="p-3.5 rounded bg-canvas border border-line">
              <span className="text-muted block text-xs font-medium">Total Rows</span>
              <span className="font-serif text-2xl font-semibold text-ink mt-0.5 block">
                {report.totalRows || 0}
              </span>
            </div>
            <div className="p-3.5 rounded bg-canvas border border-line">
              <span className="text-muted block text-xs font-medium">Successfully Imported</span>
              <span className="font-serif text-2xl font-semibold text-emerald-700 mt-0.5 block">
                {report.importedCount || 0}
              </span>
            </div>
            <div className="p-3.5 rounded bg-canvas border border-line">
              <span className="text-muted block text-xs font-medium">Duplicates Skipped</span>
              <span className="font-serif text-2xl font-semibold text-amber-700 mt-0.5 block">
                {report.duplicatesSkipped || 0}
              </span>
            </div>
            <div className="p-3.5 rounded bg-canvas border border-line">
              <span className="text-muted block text-xs font-medium">Failed Rows</span>
              <span className="font-serif text-2xl font-semibold text-rose-700 mt-0.5 block">
                {report.failedCount || 0}
              </span>
            </div>
          </div>

          {/* Itemized Failure Breakdown if any */}
          {report.errors && report.errors.length > 0 && (
            <div className="mt-4 p-4 rounded border border-rose-200 bg-rose-50/50">
              <h3 className="text-xs font-semibold text-rose-800 uppercase tracking-wider mb-2">
                Itemized Row Errors
              </h3>
              <div className="max-h-60 overflow-y-auto divide-y divide-rose-200/60 text-xs sm:text-sm">
                {report.errors.map((err, idx) => (
                  <div key={idx} className="py-2 text-rose-900 flex items-start gap-2">
                    <span className="font-mono font-semibold px-1.5 py-0.5 rounded bg-rose-200/50 shrink-0 text-xs">
                      Row {err.row}
                    </span>
                    <div>
                      {err.field && <span className="font-medium mr-1.5">[{err.field}]</span>}
                      <span>{err.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-between text-sm">
            <span className="text-muted">
              {report.importedCount > 0 ? 'Catalog updated.' : 'No new records added.'}
            </span>
            <Link
              to="/admin/opportunities"
              className="text-accent hover:underline font-medium"
            >
              View Updated Catalog →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
