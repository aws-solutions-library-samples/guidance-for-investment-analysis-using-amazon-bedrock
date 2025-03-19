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
    SpaceBetween,
    Spinner,
    Table,
    TableProps,
    TextContent
} from "@cloudscape-design/components";
import Markdown from "react-markdown";

export interface news {
    uuid: string
    title: string
    publisher: string
    link: string
    providerPublishTime: number
    type: string
    thumbnail: [

    ]
    relatedTickers: string[]
}

export interface Thumbnail {
    resolutions: Resolution[]
}

export interface Resolution {
    url: string
    width: number
    height: number
    tag: string
}

export interface PriceHistoryItem {
    Date: string;
    Open: number;
    High: number;
    Close: number;
    Low: number;
    Dividends: number;
    StockSplits: number;
}

const ItemsColumnDefinitions: TableProps.ColumnDefinition<PriceHistoryItem>[] = [
    {
        id: "Date",
        header: "Date",
        sortingField: "Date",
        cell: (item) => new Date(item.Date).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
            day: "numeric",
        }),
    },
    {
        id: "Open",
        header: "Open",
        sortingField: "Open",
        cell: (item) => item.Open,
    },
    {
        id: "High",
        header: "High",
        sortingField: "High",
        cell: (item) => item.High,
    },
    {
        id: "Close",
        header: "Close",
        sortingField: "Close",
        cell: (item) => item.Close,
    },
    {
        id: "Low",
        header: "Low",
        sortingField: "Low",
        cell: (item) => item.Low,
    },
];


export default function InvestmentAnalystPage() {
    const [tckr, setTckr] = useState("");
    const [client, setClient] = useState<WebSocket>();
    const [analysis, setAnalysis] = useState("");
    const [tickerNews, setTickerNews] = useState<news[]>([]); //useState();
    const [recommendation, setRecommendation] = useState<string[]>([""]);
    const [priceHistory, setPriceHistory] = useState<any>("");
    const [information, setInformation] = useState<string>("");
    const [relatedTickers, setRelatedTickers] = useState<string[]>([""]);

    const [showSpinner, setShowSpinner] = useState<boolean>(false);
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
            //console.log(`Got Response: ${JSON.stringify(messageStr)}`);
            const kys = Object.keys(messageStr);
            kys.forEach((ky) => {
                if (ky == "body") {
                    const bdy = messageStr[ky];

                    if (bdy.hasOwnProperty("investment_response")) {
                        const investment_resp = bdy["investment_response"]
                        if ("investment_summary" in investment_resp) {
                            setAnalysis(investment_resp["investment_summary"]);
                        }
                        if ("latest_news" in investment_resp) {
                            console.log(`newsList: ${investment_resp["latest_news"]}`);
                            if (investment_resp["latest_news"] != "") {

                                try {
                                    const newsList = JSON.parse(investment_resp["latest_news"]);
                                    newsList.forEach((news: any) => {
                                        if ("title" in news) {
                                            setTickerNews((prevNews) => [...prevNews, news]);
                                        }
        
                                        if ("relatedTickers" in news) {
                                            const tickers = news["relatedTickers"];
                                            const uniqueTickers = [...new Set<string>(tickers)];
                                            setRelatedTickers(uniqueTickers);
                                        }
                                    });
                                } catch (error: any) {
                                    console.log(`error parsing news: ${error.message}`);
                                }
                              
                            }
                        }
                        if ("price_history" in investment_resp) {
                            try {
                                const pr_his = JSON.parse(investment_resp["price_history"]) ;
                                // console.log(`price_history: ${Object.keys(pr_his).join("|")}`);
                                setPriceHistory(pr_his.data);                                
                            } catch (error: any) {
                                console.log(`error parsing price history: ${error.message}`);
                            }
                        }
                        if ("knowledge" in investment_resp) {
                            setInformation(investment_resp["knowledge"]);
                        }

                        setShowSpinner(false);
                    }

                }
            });
        };

        setClient(apiClient);
    }

    const sendTicker = async () => {
        if (client != null) {
            setAnalysis("");
            setRecommendation([""]);
            setShowSpinner(true);
            client.send(
                JSON.stringify({
                    action: "getInvestmentAnalysis",
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
                    <SpaceBetween size="s">
                        <div className={styles.input_container}>
                            <Input
                                onChange={({ detail }) => setTckr(detail.value)}
                                value={tckr}
                                placeholder="Enter Stock Symbol"
                            />
                        </div>
                        <div className={styles.btn_chabot_message_copy}>
                            <Button variant="primary" onClick={sendTicker} disabled={socketReady}>Get Investment Analysis</Button>
                        </div>
                        <div style={showSpinner ? { display: 'none' } : {}}>
                            <SpaceBetween size="s">
                                <Container
                                    header={
                                        <Header variant="h2" description="">
                                            Analysis:
                                        </Header>
                                    }
                                    key="analysis_summmary"
                                >
                                    <Markdown>{analysis}</Markdown>
                                    <SpaceBetween size="s">
                                        <Container
                                            header={
                                                <Header variant="h2" description="">
                                                    Information:
                                                </Header>
                                            }
                                            key="conclusion"
                                        >
                                            {recommendation && recommendation.map((r: string) => (
                                                <div key={Math.random()}>
                                                    <Markdown>{r}</Markdown>
                                                </div>
                                            ))}
                                            <h3>News Details:</h3>
                                            <SpaceBetween size="s">
                                                <TextContent>
                                                    <ul>
                                                        {tickerNews && tickerNews.map((nws: news) => (
                                                            <li key={nws.uuid}
                                                            >
                                                                {nws.title}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </TextContent>
                                            </SpaceBetween>
                                            <h3>Related Tickers:</h3>
                                            {relatedTickers && relatedTickers.map((ticker: string) => (
                                                <TextContent key={Math.random()}>{ticker}</TextContent>
                                            ))}
                                            <h3>Price History:</h3>
                                            <Table items={priceHistory} columnDefinitions={ItemsColumnDefinitions}>

                                            </Table>
                                            <h3>Konwledge:</h3>
                                            <Markdown>{information}</Markdown>
                                        </Container>
                                    </SpaceBetween>
                                </Container>
                            </SpaceBetween>
                        </div>
                        <div style={showSpinner ? {} : { display: 'none' }}>
                            <Spinner size="large" /> Loading Investment Analysis...
                        </div>
                    </SpaceBetween>
                </div>
            }
        />
    );
}