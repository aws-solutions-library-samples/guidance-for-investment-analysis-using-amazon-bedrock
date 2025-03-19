// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { useEffect, useReducer, useRef, useState } from 'react';

import Alert from '@cloudscape-design/components/alert';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import PromptInput from '@cloudscape-design/components/prompt-input';
import parse from 'html-react-parser';

import { FittedContainer, ScrollableContainer } from './common-components';
import {
  getConnectedMessage,
  getInitializationMessage,
  getLoadingMessage,
  INITIAL_MESSAGES,
  Message
} from './config';
import Messages from './messages';

import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import '../../styles/chat.scss';

export const isVisualRefresh = true;

export default function Chat() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [prompt, setPrompt] = useState('');
  const [isGenAiResponseLoading, setIsGenAiResponseLoading] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageContent = messages[messages.length - 1].content;
  // const { user } = useAuthenticator((context) => [context.user]);
  const cnf = Amplify.getConfig();
  const [client, setClient] = useState<WebSocket>();
  const [closed, forceClose] = useReducer(() => true, false);

  useEffect(() => {
    // Scroll to the bottom to show the new/latest message
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 0);
  }, [lastMessageContent]);

  useEffect(() => {
    initializeClient();
    return () => {
      if (client != null) {
        forceClose();
        client.close();
      }
    };
  }, []);

  const initializeClient = async () => {
    setMessages(prevMessages => [...prevMessages, getInitializationMessage()]);
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    const apiClient = new WebSocket(`${cnf?.API?.REST?.WebSocketApi?.endpoint}?idToken=${idToken}`);
    setClient(apiClient);

    apiClient.onopen = () => {
      setMessages(prevMessages => prevMessages.slice(0, -1));
      setMessages(prevMessages => [...prevMessages, getConnectedMessage()]);
    };

    apiClient.onclose = () => {
      if (!closed) {
        setTimeout(async () => {
          await initializeClient();
        });
      }
    };

    apiClient.onmessage = async (message: any) => {
      const messageObj = JSON.parse(message.data);
      const kys = Object.keys(messageObj);
      if (!kys.includes("body")) {
        setIsGenAiResponseLoading(false);
        const response: Message = {
          type: 'chat-bubble',
          authorId: 'gen-ai',
          content: parse(messageObj),
          timestamp: new Date().toLocaleTimeString(),
        };
        setPrompt('');

        setMessages(prevMessages => {
          prevMessages.splice(prevMessages.length - 1, 1, response);
          return prevMessages;
        });
      }
    };
  };

  const onPromptSend = ({ detail: { value } }: { detail: { value: string } }) => {
    if (!value || value.length === 0 || isGenAiResponseLoading) {
      return;
    }
    const newMessage: Message = {
      type: 'chat-bubble',
      authorId: 'user-jane-doe',
      content: value,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prevMessages => [...prevMessages, newMessage]);
    setPrompt('');

    if (client != null) {
      setIsGenAiResponseLoading(true);
      setMessages(prevMessages => [...prevMessages, getLoadingMessage()]);
      client.send(JSON.stringify({ action: "chat", question: value }));
    }
  };

  return (
    <div className={`chat-container ${!isVisualRefresh && 'classic'}`}>
      {showAlert && (
        <Alert dismissible statusIconAriaLabel="Info" onDismiss={() => setShowAlert(false)}>
          This demo showcases how to use generative AI to conduct research by asking natural human language to help make investment related decisions.
        </Alert>
      )}

      <FittedContainer>
        <Container
          header={<Header variant="h3">Generative AI chat</Header>}
          fitHeight
          disableContentPaddings
          footer={
            <FormField
              stretch
              constraintText={
                <>
                  Use of this service is subject to the{' '}
                  <Link href="#" external variant="primary" fontSize="inherit">
                    AWS Responsible AI Policy
                  </Link>
                  .
                </>
              }
            >
              {/* During loading, action button looks enabled but functionality is disabled. */}
              {/* This will be fixed once prompt input receives an update where the action button can receive focus while being disabled. */}
              {/* In the meantime, changing aria labels of prompt input and action button to reflect this. */}
              <PromptInput
                onChange={({ detail }) => setPrompt(detail.value)}
                onAction={onPromptSend}
                value={prompt}
                actionButtonAriaLabel={isGenAiResponseLoading ? 'Send message button - suppressed' : 'Send message'}
                actionButtonIconName="send"
                ariaLabel={isGenAiResponseLoading ? 'Prompt input - suppressed' : 'Prompt input'}
                placeholder="Ask a question"
                autoFocus
              />
            </FormField>
          }
        >
          <ScrollableContainer ref={messagesContainerRef}>
            <Messages messages={messages} />
          </ScrollableContainer>
        </Container>
      </FittedContainer>
    </div>
  );
}