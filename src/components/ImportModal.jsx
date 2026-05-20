import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { parseImportCSV, generateTemplate } from '../lib/csvImport.js'

export default function ImportModal({ onClose }) {
  const fileRef = useRef()
  const [importMode, setImportMode] = useState('replace')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [staged, setStaged] = useState(null)

  function downloadTemplate() {
    const csv = generateTemplate()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bluetree_domains_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileSelect(file) {
    if (!file) return
    setImportResult(null)
    setImportError(null)
    setStaged(null)
    try {
      const text = await file.text()
      const { records, unmapped } = parseImportCSV(text)
      if (!records.length) throw new Error('No valid rows found. Make sure the file has a "domain" column.')
      setStaged({ file, records, unmapped })
    } catch (err) {
      setImportError(err.message)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function confirmImport() {
    if (!staged) return
    setImporting(true)
    setImportError(null)
    try {
      if (importMode === 'replace') {
        const { error } = await supabase.from('domains').delete().neq('id', '00000000-0000-0000-0000-000000000000')
        if (error) throw error
      }
      const CHUNK = 500
      let inserted = 0
      for (let i = 0; i < staged.records.length; i += CHUNK) {
        const { error } = await supabase.from('domains').insert(staged.records.slice(i, i + CHUNK))
        if (error) throw error
        inserted += Math.min(CHUNK, staged.records.length - i)
      }
      setImportResult({ inserted, unmapped: staged.unmapped, mode: importMode })
      setStaged(null)
    } catch (err) {
      setImportError(err.message)
    }
    setImporting(false)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 560 }}>
        <div className="card-header">
          Import Domain Inventory
          <div className="flex items-center gap-8">
            <button className="btn btn-primary btn-sm" onClick={downloadTemplate}>↓ Download template</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="card-body">
          <p className="text-muted text-sm mb-16">
            The file must have a <strong>domain</strong> column. Extra header rows are skipped automatically.
          </p>

          <div className="flex items-center gap-16 mb-16" style={{ flexWrap: 'wrap' }}>
            <div className="flex items-center gap-8">
              <label className="text-sm" style={{ fontWeight: 500 }}>Mode</label>
              <select className="form-select" style={{ width: 140 }} value={importMode} onChange={e => setImportMode(e.target.value)}>
                <option value="replace">Replace all</option>
                <option value="append">Append rows</option>
              </select>
            </div>
            <div className="form-hint" style={{ margin: 0 }}>
              {importMode === 'replace'
                ? 'Deletes all existing domains then imports the file fresh.'
                : 'Adds rows without removing existing domains. May create duplicates.'}
            </div>
          </div>

          {!staged ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]) }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--gray-300)'}`,
                borderRadius: 'var(--radius)',
                padding: '32px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--blue-light)' : 'transparent',
                transition: 'border-color .15s, background .15s',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop CSV here or click to browse</div>
              <div className="text-muted text-sm">Supports the original BlueTree export format or the template</div>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>📄 {staged.file.name}</div>
              <div className="text-muted text-sm">
                {staged.records.length.toLocaleString()} rows ready
                {importMode === 'replace' && ' — existing inventory will be deleted first'}
              </div>
              {staged.missingRecommended?.length > 0 && (
                <div className="text-sm mt-8" style={{ color: 'var(--orange)' }}>
                  ⚠ Missing recommended columns: {staged.missingRecommended.join(', ')} — scoring quality may be reduced.
                </div>
              )}
              {staged.unmapped?.length > 0 && (
                <div className="text-sm mt-8" style={{ color: 'var(--gray-500)' }}>
                  Unrecognised columns (ignored): {staged.unmapped.join(', ')}
                </div>
              )}
              {staged.skippedNoDomain > 0 && (
                <div className="text-sm mt-8" style={{ color: 'var(--gray-500)' }}>
                  Skipped {staged.skippedNoDomain} row(s) with no domain value.
                </div>
              )}
              <div className="flex items-center gap-8 mt-16">
                <button className="btn btn-secondary btn-sm" onClick={() => setStaged(null)} disabled={importing}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importing…' : `Import ${staged.records.length.toLocaleString()} rows`}
                </button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files[0])} />

          {importError && <div className="alert alert-error mt-16">{importError}</div>}
          {importResult && (
            <div className="alert alert-info mt-16">
              <strong>{importResult.inserted.toLocaleString()} rows imported</strong>
              {importResult.mode === 'replace' && ' — previous inventory replaced'}
              {importResult.unmapped?.length > 0 && (
                <div className="text-sm mt-8">Unrecognised columns (ignored): {importResult.unmapped.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
