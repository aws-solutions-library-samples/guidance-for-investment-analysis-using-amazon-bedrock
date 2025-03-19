import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useReducer, useState } from "react";
import BaseAppLayout from "../components/base-app-layout";
import styles from "../styles/tckrnews-ui.module.scss";

import {
    Button,
    Container,
    Header,
    Input,
    Slider,
    SpaceBetween,
    Spinner,
    TextContent
} from "@cloudscape-design/components";

export interface news {
    title: string,
    summary: string,
    source: string,
    url: string,
    ticker_sentiment_score: number,
    ticker_sentiment_label: string,
}

export default function TickerNewsPage() {
    const [value, setValue] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tickerNews, setTickerNews] = useState<any[]>([]); //useState();
    const [summary, setSummary] = useState("");
    const [client, setClient] = useState<WebSocket>();
    const [socketReady, setSocketReady] = useState<boolean>(true);
    const cnf = Amplify.getConfig();
    const [closed, forceClose] = useReducer(() => true, false);
    const [showSpinner, setShowSpinner] = useState<boolean>(false);

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

            // setTimeout(async () => {
            //   await initializeClient();
            // });            
        };

        apiClient.onclose = () => {
            setSocketReady(true);
            if (!closed) {

                setTimeout(async () => {
                    await initializeClient();
                });
            }
        };

        apiClient.onmessage = async (message: MessageEvent) => {
            // console.log(`Got Message: ${JSON.stringify(message)}`);
            const messageStr = JSON.parse(message.data);
            // console.log(`Got Response: ${JSON.stringify(messageStr)}`);
            //console.log(`Prop Names: ${Object.getOwnPropertyNames(message.data)}`);
            // if (message.data.includes("news")) {
            //     messageStr = JSON.parse(messageStr);
            // }
            const kys = Object.keys(messageStr);

            kys.forEach((ky) => {
                // console.log(`ky: ${ky} | vals: ${messageStr[ky]}`);
                if (ky == "news") {
                    setTickerNews(messageStr[ky]);
                }
                if (ky == "summary") {
                    setSummary(messageStr[ky]);
                    setShowSpinner(false);
                }
            })
            // console.log(`TickerNews: ${JSON.stringify(tickerNews)}`);
        };

        setClient(apiClient);
    };

    const sendTicker = async () => {
        setShowSpinner(true);
        setSummary("");
        setTickerNews([]);

        if (client != null) {
            client.send(
                JSON.stringify({
                    action: "getTickerNews",
                    tickr: value,
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
                            onChange={({ detail }) => setValue(detail.value)}
                            value={value}
                            placeholder="Enter Stock Symbol"
                        />
                    </div>
                    <div className={styles.btn_chabot_message_copy}>
                        <Button variant="primary" onClick={sendTicker} disabled={socketReady}>Get News</Button>
                    </div>
                    <div style={showSpinner ? { display: 'none' } : {}}>
                        <TextContent>
                            <h2>Ticker News:</h2>
                            <h3>Summary:</h3>
                            <p>{summary}</p>
                        </TextContent>
                        <h3>News Details:</h3>
                        <SpaceBetween size="s">
                            {tickerNews && tickerNews.map((news: news) => (
                                <Container
                                    header={
                                        <Header variant="h2" description="Title">
                                            {news.title}
                                        </Header>
                                    }
                                    key={news.title}
                                >
                                    Source: <a href={news.url}>{news.source}</a><br/>
                                    Ticker Sentiment Score: <Slider value={Math.round(news.ticker_sentiment_score*100)} disabled min={-100} max={100} 
                                          referenceValues={[-100, -30, 10, 30, 100]}
                                          valueFormatter={value => [
                                                { value: -100, label: "Bearish" },
                                                { value: -30, label: "Somewhat Bearish" },
                                                { value: 10, label: "Neutral" },
                                                { value: 30, label: "Somewhat Bullish" },
                                                { value: 100, label: "Bullish" }
                                                ].find(item => item.value == value) ?.label || "-"
                                            }
                                          step={10}
                                          tickMarks
                                        ></Slider><br/>
                                    Ticker Sentiment Label: {news.ticker_sentiment_label}<br/>
                                </Container>
                            ))}
                        </SpaceBetween>
                    </div>
                    <div style={showSpinner ? {} : { display: 'none' } }>
                        <Spinner size="large"/> Getting News and Sentiment...
                    </div>
                </div>
            }
        />
    );
}