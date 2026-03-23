interface StatusPillProps {
  text: string;
  accent?: boolean;
}

export default function StatusPill({ text, accent = false }: StatusPillProps) {
  return (
    <span className={`rounded-full border px-4 py-2 text-xs backdrop-blur ${
      accent
        ? 'border-[#d6dde5] bg-[#eef1f4] text-[#34527a]'
        : 'border-[#ddd7cc] bg-[#fffdfa]/94 text-[#5f6b79]'
    }`}>
      {text}
    </span>
  );
}
