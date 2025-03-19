import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { useEffect, useReducer, useState } from "react";
import BaseAppLayout from "../components/base-app-layout";
import styles from "../styles/tckrnews-ui.module.scss";
//import { BarSeries } from '@cloudscape-design/components';

import {
    BarChart,
    BarChartProps,
    Button,
    Container,
    Header,
    Input,
    SpaceBetween,
    Spinner,
} from "@cloudscape-design/components";
import Markdown from "react-markdown";

export const incomeSeries: BarChartProps<Date>['series'] = [];

type analysis = {
    title: string,
    details: string
}

export default function FundamentalAnalysisPage() {
    const [tckr, setTckr] = useState("");
    const [client, setClient] = useState<WebSocket>();
    const [summary, setSummary] = useState("");
    const [conclusion, setConclusion] = useState("");
    const [analyses, setAnalyses] = useState<analysis[]>([]);
    const [incomeStatement, setIncomeStatement] = useState(incomeSeries);
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
            console.log(`Got Message: ${JSON.stringify(message)}`);
            const messageStr = JSON.parse(message.data);
            const kys = Object.keys(messageStr);

            kys.forEach((ky) => {
                if (ky == "financial_summary") {
                    console.log(`financial_summary: ${JSON.stringify(messageStr[ky])}`);
                    setSummary(messageStr["financial_summary"]["overall_summary"]);
                    setAnalyses([]);

                    const anlysisKys = Object.keys(messageStr["financial_summary"]["analysis"]);
                    anlysisKys.forEach((anlysisKy) => {
                        if (messageStr["financial_summary"]["analysis"][anlysisKy] != "")
                            console.log(`analysis: ${anlysisKy}: ${messageStr["financial_summary"]["analysis"][anlysisKy]}`);
                            setAnalyses((prevAnalyses) => [
                                ...prevAnalyses,
                                {
                                    title: anlysisKy,
                                    details: messageStr["financial_summary"]["analysis"][anlysisKy].replace("\n", "")
                                }
                            ]);
                    });
                }

                if (ky == "conclusion") {
                    setConclusion(messageStr[ky]);
                }

                if (ky == "income_statement") {
                    const incomeStatement = JSON.parse(messageStr["income_statement"]["income_statement"]);

                    const netIncome: { date: Date; net_income: number; }[] = [];
                    const totRevenue: { date: Date; tot_revenue: number; }[] = [];
                    const opRevenue: { date: Date; op_revenue: number; }[] = [];
                    const incomeStatementKys = Object.keys(incomeStatement);
                    incomeStatementKys.forEach((incomeStatementKy) => {
                        let d = new Date(incomeStatementKy);
                        const incmLines = incomeStatement[incomeStatementKy];
                        const incmLinesKys = Object.keys(incmLines);
                        incmLinesKys.forEach((incmLinesKy) => {
                            switch (incmLinesKy) {
                                case "Net Income":
                                    netIncome.push({
                                        date: d,
                                        'net_income': Number(incmLines[incmLinesKy])
                                    });
                                    break;
                                case "Total Revenue":
                                    totRevenue.push({
                                        date: d,
                                        'tot_revenue': Number(incmLines[incmLinesKy])
                                    });
                                    break;
                                case "Operating Revenue":
                                    opRevenue.push({
                                        date: d,
                                        'op_revenue': Number(incmLines[incmLinesKy])
                                    });

                            }
                        })
                    });
                    const incomeStatementBarChartSeries: BarChartProps<Date>['series'] = [
                        {
                            title: "Net Income",
                            type: "bar",
                            data: netIncome.map(datum => ({ x: datum.date, y: datum['net_income'] })),
                        },
                        {
                            title: "Total Revenue",
                            type: "bar",
                            data: totRevenue.map(datum => ({ x: datum.date, y: datum['tot_revenue'] })),
                        },
                        {
                            title: "Operating Revenue",
                            type: "bar",
                            data: opRevenue.map(datum => ({ x: datum.date, y: datum['op_revenue'] })),
                        },
                    ];
                    setIncomeStatement(incomeStatementBarChartSeries);
                    setShowSpinner(false);
                }
            });
        };

        setClient(apiClient);
    };

    const sendTicker = async () => {
        if (client != null) {
            setShowSpinner(true);
            client.send(
                JSON.stringify({
                    action: "getFundamentalAnalysis",
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
                                ariaLabel="Stock Symbol:"
                                onChange={({ detail }) => setTckr(detail.value)}
                                value={tckr}
                                placeholder="Enter Stock Symbol"
                            />
                        </div>
                        <div className={styles.btn_chabot_message_copy}>
                            <Button variant="primary" onClick={sendTicker} disabled={socketReady}>Get Fundamentals & Financials</Button>
                        </div>
                        <div style={showSpinner ? { display: 'none' } : {}}>
                            <SpaceBetween size="s">
                                <Container
                                    header={
                                        <Header variant="h2" description="">
                                            Fundamentals:
                                        </Header>
                                    }
                                    key="analysis_summmary"
                                >
                                    {summary}
                                    <SpaceBetween size="s">
                                        {analyses && analyses.map((al: analysis) => (
                                            <Container
                                                header={
                                                    <Header variant="h2" description="">
                                                        {al.title}
                                                    </Header>
                                                }
                                                key={al.title}
                                            >
                                                <Markdown>{al.details}</Markdown>
                                            </Container>
                                        ))}
                                        <Container
                                            header={
                                                <Header variant="h2" description="">
                                                    Conclusion:
                                                </Header>
                                            }
                                            key="conclusion"
                                        >
                                            <Markdown>{conclusion}</Markdown>
                                        </Container>
                                    </SpaceBetween>
                                </Container>
                                <Container
                                    header={
                                        <Header variant="h2" description="Financial Summary">
                                            Financial Analysis:
                                        </Header>
                                    }
                                    key="financial_analysis"
                                >
                                    <BarChart series={incomeStatement} i18nStrings={{
                                        xTickFormatter: e =>
                                            e
                                                .toLocaleDateString("en-US", {
                                                    month: "short",
                                                    year: "numeric",
                                                })
                                                .split(",")
                                                .join("\n"),
                                        yTickFormatter: function o(e) {
                                            return Math.abs(e) >= 1e9
                                                ? (e / 1e9).toFixed(1).replace(/\.0$/, "") +
                                                "G"
                                                : Math.abs(e) >= 1e6
                                                    ? (e / 1e6).toFixed(1).replace(/\.0$/, "") +
                                                    "M"
                                                    : Math.abs(e) >= 1e3
                                                        ? (e / 1e3).toFixed(1).replace(/\.0$/, "") +
                                                        "K"
                                                        : e.toFixed(2);
                                        }
                                    }} />
                                </Container>
                            </SpaceBetween>
                        </div>
                        <div style={showSpinner ? {} : { display: 'none' }}>
                            <Spinner size="large" /> Loading Fundamentals and Financial Analysis...
                        </div>
                    </SpaceBetween>
                </div>
            }
        />
    );
}