// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { I18nProvider } from '@cloudscape-design/components/i18n';
import enMessages from '@cloudscape-design/components/i18n/messages/all.en.json';

import BaseAppLayout from '../base-app-layout';
import Chat from './chat';


export function ChatUI() {
  return (
    <I18nProvider locale="en" messages={[enMessages]}>
      <BaseAppLayout
        maxContentWidth={1280}
        toolsHide
        content={<Chat />}
      />
    </I18nProvider>
  );
}