import { notFound } from 'next/navigation';
import CharacterInspection from '@/components/CharacterInspection';

export default function CharacterInspectionPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CharacterInspection />;
}
