export default function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="section-title">
      {eyebrow && <p className="eyebrow dark">{eyebrow}</p>}
      <h2>{title}</h2>
      {text && <p className="section-text">{text}</p>}
    </div>
  );
}
