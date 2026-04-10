"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { TripPhoto } from "./trip-photo-data";

type TripPhotoGridProps = {
  photos: TripPhoto[];
  /** LCP: first thumbnail loads with priority */
  priorityFirst?: boolean;
};

export function TripPhotoGrid({ photos, priorityFirst }: TripPhotoGridProps) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {photos.map((p, i) => (
          <button
            key={p.src}
            type="button"
            onClick={() => setOpen(i)}
            className="group overflow-hidden rounded-2xl border-2 border-teal-200/70 bg-white text-left shadow-md shadow-teal-900/10 outline-none ring-teal-500 transition hover:border-teal-300 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffbeb]"
            aria-label={`Enlarge: ${p.caption}`}
          >
            <div className="relative aspect-[16/10] w-full bg-teal-100/40">
              <Image
                src={p.src}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 360px"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
                priority={priorityFirst && i === 0}
              />
            </div>
            <span className="block border-t border-teal-100/90 bg-gradient-to-b from-teal-50/90 to-amber-50/40 px-3 py-2.5 text-sm leading-snug text-teal-900/88">
              {p.caption}
            </span>
          </button>
        ))}
      </div>

      {open !== null && photos[open] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-teal-950/88 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setOpen(null)}
          role="presentation"
        >
          <div
            className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border-2 border-white/25 bg-gradient-to-b from-teal-900/95 to-teal-950 p-3 shadow-2xl sm:p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged photo"
          >
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="absolute right-2 top-2 z-10 rounded-full border-2 border-white/40 bg-teal-950/90 px-3 py-1.5 text-sm font-semibold text-white shadow-md hover:bg-teal-900"
            >
              Close
            </button>
            <figure className="pt-10 sm:pt-2">
              <Image
                src={photos[open].src}
                alt={photos[open].alt}
                width={photos[open].width}
                height={photos[open].height}
                className="mx-auto h-auto max-h-[min(78vh,900px)] w-full rounded-lg object-contain"
                sizes="(max-width: 1280px) 95vw, 1024px"
                priority
              />
              <figcaption className="mt-3 text-center text-sm leading-relaxed text-white/95">
                {photos[open].caption}
              </figcaption>
            </figure>
          </div>
        </div>
      )}
    </>
  );
}
