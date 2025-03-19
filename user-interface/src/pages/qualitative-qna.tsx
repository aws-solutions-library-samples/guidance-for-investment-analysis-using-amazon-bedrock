import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useReducer, useState } from "react";
import BaseAppLayout from "../components/base-app-layout";
import styles from "../styles/tckrnews-ui.module.scss";

import {
    Button,
    Input,
} from "@cloudscape-design/components";

export default function QualitativeQnAPage() {
    const [tckr, setTckr] = useState("");
    const [client, setClient] = useState<WebSocket>();
    const [analysis, setAnalysis] = useState("");
    const [socketReady, setSocketReady] = useState<boolean>(true);
    const cnf = Amplify.getConfig();
    const [closed, forceClose] = useReducer(() => true, false);

    const initializeClient = async () => {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        const apiClient = new WebSocket(`${cnf?.API?.REST?.WebSocketApi?.endpoint}?idToken=${idToken}`);

        apiClient.onopen = () => {
            setSocketReady(false);
        };

        apiClient.onerror = (e: any) => {
            setSocketReady(true);
            console.error(e);

            setTimeout(async () => {
              await initializeClient();
            });            
        };

        apiClient.onclose = () => {
            setSocketReady(true);
            if (!closed) {
                setTimeout(async () => {
                    await initializeClient();
                });
            }
        };

        apiClient.onmessage = async (message: any) => {
            const messageStr = JSON.parse(message.data);
            console.log(`Got Response: ${JSON.stringify(messageStr)}`);
            setAnalysis(JSON.stringify(messageStr));
        };

        setClient(apiClient);
    };

    const sendTicker = async () => {
        if (client != null) {
            client.send(
                JSON.stringify({
                    action: "getQualitativeQnA", 
                    tickr: tckr,
                }));
        } else {
            console.log("client is null");
        }
    };

    useEffect(() => {
        initializeClient();
        return () => {
            if (client != null) {
                forceClose();
                client.close();
            }
        };
    }, []);

    return (
        <BaseAppLayout
            content={
                <div className={styles.news_container}>
                    <div className={styles.input_container}>
                        <Input
                            onChange={({ detail }) => setTckr(detail.value)}
                            value={tckr}
                            placeholder="Enter Stock Symbol"
                        />
                    </div>
                    <div className={styles.btn_chabot_message_copy}>
                        <Button variant="primary" onClick={sendTicker} disabled={socketReady}>Get Qualitative Analysis</Button>
                    </div>
                    {analysis}
                </div>
                }
        />
    );
}