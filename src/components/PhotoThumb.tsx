import { useEffect, useState } from 'react';
import { Image, Skeleton, SkeletonItem } from '@fluentui/react-components';
import { signedUrl } from '../lib/services';

export function PhotoThumb({ path, alt, height = 120, fit = 'cover' }: { path: string; alt: string; height?: number | string; fit?: 'cover' | 'contain' }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    signedUrl('photos', path).then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [path]);
  if (!url) return <Skeleton style={{ height, width: '100%' }}><SkeletonItem style={{ height, width: '100%' }} /></Skeleton>;
  return <Image src={url} alt={alt} fit={fit} shape="rounded" style={{ height, width: '100%', objectFit: fit, display: 'block' }} />;
}
