import AppLayout, { AppLayoutProps } from '@cloudscape-design/components/app-layout';
import { I18nProvider } from '@cloudscape-design/components/i18n';
import enMessages from '@cloudscape-design/components/i18n/messages/all.en.json';
import { forwardRef } from 'react';

export const CustomAppLayout = forwardRef<AppLayoutProps.Ref, AppLayoutProps>(function CustomAppLayout(props, ref) {
    return (
      <I18nProvider locale="en" messages={[enMessages]}>
        <AppLayout ref={ref} {...props} />
      </I18nProvider>
    );
  });