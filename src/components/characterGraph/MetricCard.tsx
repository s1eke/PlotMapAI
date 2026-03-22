interface MetricCardProps {
  label: string;
  value: string;
}

export default function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-[18px] border border-[#ddd7cc] bg-[#f7f5f0] px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#697384]">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#18202a]">{value}</p>
    </div>
  );
}
