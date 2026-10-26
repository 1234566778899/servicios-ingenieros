import { useEffect, useState } from 'react';
import { Image, Skeleton, SkeletonItem } from '@fluentui/react-components';
import { signedUrl, signedUrlOrNull, thumbPath } from '../lib/services';

/** Foto privada del bucket. En listas usa la miniatura (las fotos antiguas no la tienen: se muestra la completa); `full` para el visor. */
export function PhotoThumb({ path, alt, height = 120, fit = 'cover', full = false }: {
  path: string; alt: string; height?: number | string; fit?: 'cover' | 'contain'; full?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => (!full && (await signedUrlOrNull('photos', thumbPath(path)))) || signedUrl('photos', path))()
      .then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [path, full]);
  if (!url) return <Skeleton style={{ height, width: '100%' }}><SkeletonItem style={{ height, width: '100%' }} /></Skeleton>;
  return <Image src={url} alt={alt} fit={fit} shape="rounded" style={{ height, width: '100%', objectFit: fit, display: 'block' }} />;
}
