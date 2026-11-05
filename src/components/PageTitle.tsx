import type { ComponentPropsWithRef, ReactNode } from 'react';

type PageTitleProps = Pick<ComponentPropsWithRef<'h1'>, 'ref' | 'tabIndex'> & {
  children: ReactNode;
};

export default function PageTitle({ children, ref, tabIndex }: PageTitleProps) {
  return <h1 className="page-title" ref={ref} tabIndex={tabIndex}>
    {children}<span className="page-title-dot" aria-hidden="true">.</span>
  </h1>;
}
