import { useEffect, useRef, useState } from 'react';
import { Image, Skeleton, SkeletonItem, tokens } from '@fluentui/react-components';
import { signedUrl, signedUrlOrNull, thumbPath } from '../lib/services';
import { drawAnnotations, type Annotation } from '../lib/annotations';

/** Foto privada del bucket. En listas usa la miniatura (las fotos antiguas no la tienen: se muestra la completa); `full` para el visor.
 *  Con anotaciones se dibuja en un lienzo (reducido a maxPx) con las figuras encima. */
export function PhotoThumb({ path, alt, height = 120, fit = 'cover', full = false, annotations, maxPx = 480 }: {
  path: string; alt: string; height?: number | string; fit?: 'cover' | 'contain'; full?: boolean; annotations?: Annotation[]; maxPx?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const annotated = !!annotations?.length;

  useEffect(() => {
    let live = true;
    setImg(null);
    (async () => (!full && (await signedUrlOrNull('photos', thumbPath(path)))) || signedUrl('photos', path))()
      .then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [path, full]);

  useEffect(() => {
    if (!url || !annotated) return;
    const el = new window.Image();
    el.onload = () => setImg(el);
    el.src = url;
  }, [url, annotated]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !annotations) return;
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    drawAnnotations(ctx, annotations);
  }, [img, annotations, maxPx]);

  if (!url || (annotated && !img)) return <Skeleton style={{ height, width: '100%' }}><SkeletonItem style={{ height, width: '100%' }} /></Skeleton>;
  if (annotated) {
    return <canvas ref={canvas} role="img" aria-label={alt}
      style={{ height, width: '100%', objectFit: fit, display: 'block', borderRadius: tokens.borderRadiusMedium }} />;
  }
  return <Image src={url} alt={alt} fit={fit} shape="rounded" style={{ height, width: '100%', objectFit: fit, display: 'block' }} />;
}
