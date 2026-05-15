import type { CSSProperties } from 'react'

const base: CSSProperties = { fontFamily: 'inherit' }

export const s = {
  page: { padding: '24px 32px', maxWidth: 1200, margin: '0 auto' } as CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' } as CSSProperties,
  h2: { fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#cbd5e1' } as CSSProperties,
  card: { background: '#1a1d27', border: '1px solid #2d3149', borderRadius: 10, padding: 24, marginBottom: 20 } as CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13, color: '#94a3b8' },
  input: { ...base, background: '#0f1117', border: '1px solid #2d3149', borderRadius: 6, padding: '8px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%' } as CSSProperties,
  btn: { ...base, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  btnGhost: { ...base, background: 'transparent', color: '#94a3b8', border: '1px solid #2d3149', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 14 } as CSSProperties,
  btnSm: { ...base, background: '#1e2235', color: '#94a3b8', border: '1px solid #2d3149', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 } as CSSProperties,
  btnDanger: { ...base, background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', borderRadius: 6, padding: '8px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  btnSuccess: { ...base, background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', borderRadius: 6, padding: '8px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { textAlign: 'left' as const, padding: '8px 12px', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #2d3149', fontSize: 12 },
  tr: { borderBottom: '1px solid #1e2235' } as CSSProperties,
  td: { padding: '10px 12px', color: '#cbd5e1', verticalAlign: 'middle' as const } as CSSProperties,
  code: { background: '#0f1117', border: '1px solid #2d3149', borderRadius: 4, padding: '2px 6px', fontSize: 12, color: '#818cf8' } as CSSProperties,
  textarea: { ...base, background: '#0f1117', border: '1px solid #2d3149', borderRadius: 6, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, resize: 'vertical' as const, fontFamily: 'monospace', width: '100%', minHeight: 160 } as CSSProperties,
}
