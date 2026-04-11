

export default function TxtCover({ title, width = '100%', height = '100%' }: { title: string; width?: string; height?: string }) {
  // Generate a deterministically varying background based on title string hash
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + hash * 31;
  }

  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);

  const gradient = `linear-gradient(135deg, hsl(${h1}, 40%, 20%), hsl(${h2}, 50%, 15%))`;

  return (
    <div
      style={{ background: gradient, width, height }}
      className="relative flex flex-col pt-10 pb-6 px-5 text-center shadow-inner overflow-hidden border-r-4 border-black/20"
    >
      {/* Decorative 'Hardcover' spine/patterns */}
      <div className="absolute top-0 left-0 bottom-0 w-2 bg-black/10 border-r border-white/5" />
      <div className="absolute top-6 left-6 right-6 h-px bg-white/10" />

      {/* Decorative vertical lines on the right side */}
      <div className="absolute top-0 right-4 bottom-0 w-px bg-white/5" />

      {/* Title moved to top third */}
      <div className="relative z-10 w-full mt-2">
        <h3 className="text-xl sm:text-2xl font-bold text-white/90 drop-shadow-md leading-snug line-clamp-4">
          {title}
        </h3>
      </div>

      {/* Decorative lines at bottom */}
      <div className="mt-auto mb-4 border-t border-white/10 w-1/2 mx-auto" />

      {/* TXT Badge - placed at bottom right of the cover itself */}
      <div className="absolute bottom-0 right-0 bg-white/10 backdrop-blur-md px-3 py-1 rounded-tl-lg border-t border-l border-white/10">
        <span className="text-xs font-bold text-white/70 tracking-widest">TXT</span>
      </div>
    </div>
  );
}
