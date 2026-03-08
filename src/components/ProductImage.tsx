"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/types";

const fallbackImageByCategory: Record<Product["category"], string> = {
  onion: "/images/onion_01.webp",
  honey: "/images/honey_01.webp",
};

interface ProductImageProps {
  src: string;
  alt: string;
  category: Product["category"];
  className?: string;
  imageClassName?: string;
  sizes: string;
  priority?: boolean;
}

export default function ProductImage({
  src,
  alt,
  category,
  className,
  imageClassName,
  sizes,
  priority = false,
}: ProductImageProps) {
  const fallbackSrc = fallbackImageByCategory[category];
  const [imageSrc, setImageSrc] = useState(src || fallbackSrc);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`.trim()}>
      <Image
        src={imageSrc}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized
        priority={priority}
        className={imageClassName}
        onError={() => {
          if (imageSrc !== fallbackSrc) {
            setImageSrc(fallbackSrc);
          }
        }}
      />
    </div>
  );
}