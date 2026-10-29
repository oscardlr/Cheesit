'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { exerciseImage } from '@/lib/catalog';
import styles from './ExerciseThumbnail.module.css';

/** Decorative beside the visible exercise name; a neutral icon covers custom or missing art. */
export default function ExerciseThumbnail({ exerciseId, image, large = false, className = '' }: {
  exerciseId: string; image?: string; large?: boolean; className?: string;
}) {
  const source = exerciseImage(exerciseId, image);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <span className={`${styles.thumbnail} ${large ? styles.large : ''} ${className}`} aria-hidden="true">
    {source && source !== failedSource
      ? <Image src={source} alt="" width={160} height={128} unoptimized onError={() => setFailedSource(source)} />
      : <Dumbbell size={large ? 42 : 25} strokeWidth={1.6} />}
  </span>;
}
