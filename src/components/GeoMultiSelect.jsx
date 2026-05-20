import { useState } from 'react'

const COMMON = ['global', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'in', 'sg', 'nz']

export default function GeoMultiSelect({ value, onChange }) {
  const [input, setInput] = useState('')
  const tags = (value || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)

  function commit(text) {
    const next = text.trim().toLowerCase()
    if (!next) return
    if (tags.includes(next)) { setInput(''); return }
    onChange([...tags, next].join(', '))
    setInput('')
  }

  function remove(tag) {
    onChange(tags.filter(t => t !== tag).join(', '))
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(input)
    } else if (e.key === 'Backspace' && input === '' && tags.length) {
      remove(tags[tags.length - 1])
    }
  }

  return (
    <div>
      <div
        className="form-input"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 36, alignItems: 'center', cursor: 'text' }}
        onClick={e => { if (e.target === e.currentTarget) e.currentTarget.querySelector('input')?.focus() }}
      >
        {tags.map(t => (
          <span key={t} className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px' }}>
            {t === 'global' ? '🌐 global' : t.toUpperCase()}
            <button
              type="button"
              onClick={() => remove(t)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
              title={`Remove ${t}`}
            >×</button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => commit(input)}
          placeholder={tags.length === 0 ? 'global, US, UK…' : ''}
          style={{ flex: 1, minWidth: 80, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: 13, fontFamily: 'inherit', padding: 0 }}
        />
      </div>
      <div className="flex items-center gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
        {COMMON.filter(c => !tags.includes(c)).slice(0, 8).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => commit(c)}
            className="text-muted text-sm"
            style={{ background: 'none', border: '1px solid var(--gray-300)', borderRadius: 100, padding: '2px 10px', cursor: 'pointer' }}
          >
            + {c === 'global' ? '🌐 global' : c.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
