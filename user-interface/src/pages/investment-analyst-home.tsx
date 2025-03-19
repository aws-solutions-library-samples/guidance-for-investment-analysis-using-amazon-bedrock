import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Link from "@cloudscape-design/components/link";
import BaseAppLayout from "../components/base-app-layout";
import { TextContent } from "@cloudscape-design/components";

export default function InvestmentAnalystHomePage() {
    return (
        <BaseAppLayout
              content={
            <ContentLayout
            defaultPadding
            header={
                <SpaceBetween size="m">
                <Header
                    variant="h1"
                    info={<Link variant="info">Info</Link>}
                    description=""
                >
                    Investment Analyst Assistant
                </Header>
    
                </SpaceBetween>
            }
            >
            <Container
                header={
                <Header
                    variant="h2"
                    description="Welcome to the Investment Analyst Assistant"
                >
                    Introduction
                </Header>
                }
            >
                <TextContent>
                    <p>
                        This application is designed to assist Investment analysts and investors in evaluating company performance and making informed investment decisions. It provides the following features:
                    </p>
                    <ul>
                        <li>Financial Analysis: Analyze the yearly financials of companies by entering their stock ticker symbols. The application fetches and processes financial data to provide detailed insights.</li>
                        <li>Data Visualization: Visualize financial data through interactive charts and tables, making it easier to understand revenue, expenses, and income metrics.</li>
                        <li>Interactive Q&A: Upload Financial PDF documents and ask questions about their content. The application uses advanced AI to process the documents and provide accurate answers.</li>
                        <li>News & Sentiments: Analyze latest News and Sentiments for the stock.</li>
                        <li>Investment Analysis:Analyze investment by merging structured data with unstructured data such as news, social media, research reports etc.</li>
                    </ul>
                    <h3>
                        How to Use the Application
                    </h3>
                    <ol>
                        <li>Analysis Overview: Start by entering a stock ticker in the 'Analysis Overview' tab and click 'Analyze Financials' to get detailed financial analysis.</li>
                        <li>Financial Data: View detailed financial data in various formats including JSON, tables, and interactive charts in the 'Financial Data' tab.</li>
                        <li>Interactive Q&A: Upload relevant PDF documents and use the Q&A feature to ask questions about the content. This can help you dive deeper into specific areas of interest.</li>
                        <li>News and Sentiments: Start by entering a stock ticker to get latest News and Sentiment data about the stock.</li>
                        <li>Investment Analysis: This tab will help user to analyze investment by merging structured data with unstructured data such as news, social media, research reports etc.</li>
                    </ol>
                    <p>
                        Explore these features through the tabs above and enhance your investment research and analysis process
                    </p>
            </TextContent>
            </Container>
            </ContentLayout>
      }
      />        
    );
}