"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

const FRAME_WIDTH = "w-[17.6rem]";

function galleryPhotos(images: string[] | undefined, image: string | undefined): string[] {
  const listed = (images ?? []).map((url) => url.trim()).filter(Boolean);
  if (listed.length > 0) return listed;
  const single = image?.trim();
  return single ? [single] : [];
}

function slideStride(scroller: HTMLElement): number {
  const slides = scroller.querySelectorAll<HTMLElement>("[data-gallery-slide]");
  if (slides.length < 2) return slides[0]?.offsetWidth ?? 0;
  return slides[1].offsetLeft - slides[0].offsetLeft;
}

export function ProductGallery({
  image,
  images,
  title,
}: {
  image?: string;
  images?: string[];
  title: string;
}) {
  const photos = galleryPhotos(images, image);
  const [active, setActive] = useState(0);
  const current = photos[Math.min(active, Math.max(photos.length - 1, 0))] ?? "";

  if (photos.length === 0) {
    return (
      <div
        className={cn(
          "bg-muted mx-auto aspect-square rounded-xl md:mx-0 md:w-full",
          FRAME_WIDTH
        )}
        data-gallery-frame
      />
    );
  }

  if (photos.length === 1) {
    return (
      <PhotoFrame
        src={photos[0]}
        alt={title}
        priority
        className={cn("mx-auto md:mx-0 md:w-full", FRAME_WIDTH)}
      />
    );
  }

  return (
    <div className="min-w-0">
      <MobileLoop photos={photos} title={title} />
      <div className="hidden w-full items-start gap-3 md:grid md:grid-cols-[4rem_minmax(0,1fr)]">
        <div className="flex w-16 shrink-0 flex-col gap-2">
          {photos.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Фото ${index + 1}`}
              aria-current={index === active}
              className={cn(
                "relative size-16 overflow-hidden rounded-md",
                index === active ? "ring-primary ring-2" : "ring-border opacity-70 ring-1"
              )}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
        <PhotoFrame
          src={current}
          alt={`${title}, фото ${active + 1}`}
          priority={active === 0}
          className="w-full"
        />
      </div>
    </div>
  );
}

function MobileLoop({ photos, title }: { photos: string[]; title: string }) {
  const count = photos.length;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(count * 3);
  const nextPhoto = useRef(0);
  const prevPhoto = useRef(count - 1);
  const shiftRef = useRef(0);
  const growing = useRef(false);
  const [ready, setReady] = useState(false);
  const [slides, setSlides] = useState(() =>
    Array.from({ length: count * 3 }, (_, index) => ({
      id: index,
      photoIndex: index % count,
    }))
  );

  useEffect(() => {
    for (const src of photos) {
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = src;
    }
  }, [photos]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (shiftRef.current) {
      scroller.scrollLeft += shiftRef.current;
      shiftRef.current = 0;
    }
    growing.current = false;
    if (ready) return;

    const place = () => {
      const stride = slideStride(scroller);
      if (stride <= 0) return;
      scroller.scrollLeft = count * stride;
      setReady(true);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [count, ready, slides]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !ready) return;

    const extend = () => {
      if (growing.current) return;
      const stride = slideStride(scroller);
      if (stride <= 0) return;
      const ahead = scroller.scrollWidth - scroller.scrollLeft - scroller.clientWidth;
      if (ahead < stride * 2) {
        growing.current = true;
        const photoIndex = nextPhoto.current;
        nextPhoto.current = (photoIndex + 1) % count;
        setSlides((current) => [...current, { id: idRef.current++, photoIndex }]);
        return;
      }
      if (scroller.scrollLeft < stride * 2) {
        growing.current = true;
        const photoIndex = prevPhoto.current;
        prevPhoto.current = (photoIndex - 1 + count) % count;
        shiftRef.current = stride;
        setSlides((current) => [{ id: idRef.current++, photoIndex }, ...current]);
      }
    };

    scroller.addEventListener("scroll", extend, { passive: true });
    return () => scroller.removeEventListener("scroll", extend);
  }, [count, ready]);

  return (
    <div
      ref={scrollerRef}
      aria-label="Фотографии товара"
      className={cn(
        "flex snap-x snap-mandatory gap-3 overflow-x-auto md:hidden",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        ready ? "visible" : "invisible"
      )}
      style={{
        paddingInline: "max(0px, calc((100% - 17.6rem) / 2))",
        scrollPaddingInline: "max(0px, calc((100% - 17.6rem) / 2))",
        overflowAnchor: "none",
      }}
    >
      {slides.map((slide) => (
        <div
          key={slide.id}
          data-gallery-slide
          className={cn("shrink-0 snap-center snap-always", FRAME_WIDTH)}
        >
          <PhotoFrame
            src={photos[slide.photoIndex]}
            alt={`${title}, фото ${slide.photoIndex + 1}`}
            priority={slide.photoIndex === 0}
          />
        </div>
      ))}
    </div>
  );
}

function PhotoFrame({
  src,
  alt,
  priority,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("bg-muted relative aspect-square overflow-hidden rounded-xl", className)}
      data-gallery-frame
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 282px, 500px"
        className="object-cover"
        priority={priority}
        unoptimized
        draggable={false}
      />
    </div>
  );
}
