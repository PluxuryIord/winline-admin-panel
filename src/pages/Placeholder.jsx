export default function Placeholder({ title }) {
  return (
    <div style={{
      backgroundColor: 'var(--color-panel)',
      padding: '40px',
      borderRadius: '24px',
      height: '100%',
      border: '1px solid rgba(255, 255, 255, 0.05)',
    }}>
      <h1>{title}</h1>
      <p style={{ marginTop: '16px', color: '#888' }}>
        Скоро будет
      </p>
    </div>
  );
}