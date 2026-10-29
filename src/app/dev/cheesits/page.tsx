import { notFound } from 'next/navigation';
import CheesitInspection from '@/components/CheesitInspection';

export default function CheesitInspectionPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CheesitInspection />;
}
