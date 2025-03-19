// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';

import Box from '@cloudscape-design/components/box';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';

export type Message = ChatBubbleMessage | AlertMessage;

type ChatBubbleMessage = {
  type: 'chat-bubble';
  authorId: string;
  content: React.ReactNode;
  timestamp: string;
  actions?: React.ReactNode;
  hideAvatar?: boolean;
  avatarLoading?: boolean;
};

type AlertMessage = {
  type: 'alert';
  content: React.ReactNode;
  header?: string;
};

// added as function so that timestamp is evaluated when function is called
export const getInvalidPromptResponse = (): Message => ({
  type: 'chat-bubble',
  authorId: 'gen-ai',
  content: (
    <>
      The interactions and functionality of this demo are limited.
      <div>1. To see how an incoming response from generative AI is displayed, ask "Show a loading state example".</div>
      <div>2. To see an error alert that appears when something goes wrong, ask "Show an error state example".</div>
    </>
  ),
  timestamp: new Date().toLocaleTimeString(),
});

export const getInitializationMessage = (): Message => ({
  type: 'chat-bubble',
  authorId: 'gen-ai',
  content: <Box color="text-status-inactive">Initializing Connection....</Box>,
  timestamp: new Date().toLocaleTimeString(),
  avatarLoading: true,
});

export const getConnectedMessage = (): Message => ({
  type: 'chat-bubble',
  authorId: 'gen-ai',
  content: <Box color="text-status-inactive">Initialized Connection....</Box>,
  timestamp: new Date().toLocaleTimeString(),
  avatarLoading: false,
});

export const getLoadingMessage = (): Message => ({
  type: 'chat-bubble',
  authorId: 'gen-ai',
  content: <Box color="text-status-inactive">Generating a response</Box>,
  timestamp: new Date().toLocaleTimeString(),
  avatarLoading: true,
});

const getLoadingStateResponseMessage = (): Message => ({
  type: 'chat-bubble',
  authorId: 'gen-ai',
  content: 'That was the loading state. To see the loading state again, ask "Show a loading state example".',
  timestamp: new Date().toLocaleTimeString(),
  avatarLoading: false,
});

const getErrorStateResponseMessage = (): Message => ({
  type: 'alert',
  header: 'Access denied',
  content: (
    <SpaceBetween size="s">
      <span>
        Sample Error Message...
      </span>
      <div className="access-denied-alert-wrapper">
        <div className="access-denied-alert-wrapper__box">
          <SpaceBetween size="xxxs">
            <div className="access-denied-alert-wrapper__box__content">
              <div className="access-denied-alert-wrapper__box__content__message">
                <div className="access-denied-alert-wrapper__box__content__message__header">
                  <Box variant="h4">Access denied</Box>
                </div>
                <div className="access-denied-alert-wrapper__box__content__message__body">
                  <Box variant="p">
                    You do not have permission to perform this action.
                  </Box>
                </div>
              </div>
              <div className="access-denied-alert-wrapper__box__content__actions">
                <Link href="XXXXXXXXXXXXXXXXXXXXXX" variant="primary">
                  Learn more
                </Link>
              </div>
            </div>
          </SpaceBetween>
        </div>
        <div>
          <CopyToClipboard
            copyButtonText="Copy"
            copyErrorText="Text failed to copy"
            copySuccessText="Text copied"
            textToCopy={`Sample Error Message...
              `}
          />
        </div>
      </div>
    </SpaceBetween>
  ),
});

type ValidPromptType = {
  prompt: Array<string>;
  getResponse: () => Message;
};

export const validLoadingPrompts = ['show a loading state example', 'loading state', 'loading'];

export const VALID_PROMPTS: Array<ValidPromptType> = [
  {
    prompt: validLoadingPrompts,
    getResponse: getLoadingStateResponseMessage,
  },
  {
    prompt: ['show an error state example', 'error state', 'error'],
    getResponse: getErrorStateResponseMessage,
  },
];

// Needed only for the existing messages upon page load.
function getTimestampMinutesAgo(minutesAgo: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minutesAgo);

  return d.toLocaleTimeString();
}

export type AuthorAvatarProps = {
  type: 'user' | 'gen-ai';
  name: string;
  initials?: string;
  loading?: boolean;
};
type AuthorsType = {
  [key: string]: AuthorAvatarProps;
};

export const AUTHORS: AuthorsType = {
  'user-jane-doe': { type: 'user', name: "" , initials: 'JD' },
  'gen-ai': { type: 'gen-ai', name: 'Generative AI assistant' },
};

export const INITIAL_MESSAGES: Array<Message> = [
  {
    type: 'chat-bubble',
    authorId: 'gen-ai',
    content: (
      <>
        <div>Hi there! I'm an AI Investment Analysis Assistant created to demonstrate how generative AI can help you with your business.</div>
        <div>You can ask me questions like the following: </div>
        <div>1.	What are the notable trends for the sectors contained in the portfolio? </div>
        <div>2.	What are the most significant risks facing the stocks in this portfolio?</div>
        <div>3.	What are the macro-economic factors that are most significant to the portfolio’s results in the past 12 mos?</div>
        <div>4.	According to the information in the document repository, which sector is well positioned to perform the best in the next year?</div>
        <div>5.	What stocks, not included in the current portfolio but in the same segments, should be considered for this portfolio given the investment goals?</div>
      </>
    ),
    timestamp: getTimestampMinutesAgo(5),
  }
];