import json
import os
from typing import Optional, Type, Union

import boto3
import yfinance as yf
from aws_lambda_powertools import Logger, Tracer
from langchain.callbacks.manager import (AsyncCallbackManagerForToolRun,
                                         CallbackManagerForToolRun)
from langchain.tools import BaseTool, tool
from pydantic import BaseModel, Field

logger = Logger(service="InvestmentAnalysisTool")
tracer = Tracer(service="InvestmentAnalysisTool")

bedrock_region = os.environ["AWS_REGION"]
KB_ID = os.environ["KB_ID"]
bedrock_agent_runtime_client = boto3.client("bedrock-agent-runtime", region_name=bedrock_region)

logger.info(f"KB_ID : {KB_ID}")

# Define the input schema for the income statement tool
class InvestmentAnalysisInput(BaseModel):
    ticker: str = Field(description="The stock ticker symbol to fetch the income statement for.")

class InvestmentAnalysisOutput(BaseModel):
    recommendation: str = Field(description="Recommendation based on the investment analysis.")
    cash_flow: str = Field(description="Cash flow of the company.")
    income_statement: str = Field(description="Annual income statement of the company.")
    latest_news: str = Field(description="Latest news related to stock market.")
    price_history: str = Field(description="History of end of the day price for past 6 months.")
    profitability: str = Field(description="Profitability of the company.")
    growth_rate: str = Field(description="Growth rate of the company.")
    valuation: str = Field(description="Valuation of the company.")
    future_projection: str = Field(description="Future projection of the company.")

@tool
@tracer.capture_method
def search_knowledge_base(query: str) -> str:
    """
    This tool provides the historical news related to stock market. 
    Use this tool to get information about sector, to know the key players in a sector
    or to understand the policies and what other companies are doing. 
    """
    logger.debug("search_knowledge_base - Retrieving context from knowledge base.")
    # retreive api for fetching only the relevant context.
    relevant_documents = bedrock_agent_runtime_client.retrieve(
        retrievalQuery= {
            'text': query
        },
        knowledgeBaseId=KB_ID,
        retrievalConfiguration= {
            'vectorSearchConfiguration': {
                'numberOfResults': 5 # will fetch top 10 documents which matches closely with the query.
            }
        }
    )

    relevant_documents = relevant_documents.get("retrievalResults")
    logger.info("Relevant documents = %s", relevant_documents)
    response = {}
    news_lst = []
    for relevant_document in relevant_documents:
        content = relevant_document.get("content")
        news = content.get("text")
        news_lst.append(news)
    
    response["news_list"] = news_lst

    return response

@tool
@tracer.capture_method
def get_price_history(ticker: str) -> str:
    """This tool will provide the stock prices of past 6 months.
    The input parameter is stock ticker prices and output will be
    history of end of the day price for past 6 months"""
    logger.debug("get_price_history - Retrieving stock price history.")
    stock = yf.Ticker(ticker)
    stock_data = stock.history(period="6mo").to_json(date_format="iso", orient="table")
    return stock_data

@tool
@tracer.capture_method
def get_company_info(ticker: str) -> str:
    """This tool will provide the company information.
    The input parameter is stock ticker prices and output will be
    company information"""
    logger.debug("get_company_info - Retrieving company information.")
    stock = yf.Ticker(ticker)
    company_info = stock.info.to_json()
    return company_info

@tool
@tracer.capture_method
def get_recommendations(ticker: str) -> str:
    """This tool will provide the company recommendations.
    The input parameter is stock ticker prices and output will be
    company recommendations"""
    logger.debug("get_recommendations - Retrieving company recommendations.")
    stock = yf.Ticker(ticker)
    recommendations = stock.recommendations.to_json()
    return recommendations

@tool
@tracer.capture_method
def get_income_statement(ticker: str) -> str:
    """This tool will provide the annual income statement of the company.
    The input parameter is stock ticker prices and output will be
    annual income statement of the company"""
    logger.debug("get_income_statement - Retrieving income statement.")
    stock = yf.Ticker(ticker)
    income_statement = stock.quarterly_income_stmt
    if income_statement.empty:
        logger.exception(f"No income statement data available for {ticker}")
        return f"No income statement data available for {ticker}."

    # logger.info("Type of the statement = ", type(income_statement))
    income_statement_str = income_statement.to_json()
    logger.info("Income statement = ", income_statement)
    # logger.info("Type of the statement after conversion = ", type(income_statement_str))
    #return income_statement_str
    return income_statement_str

@tool
@tracer.capture_method
def get_balance_sheet(ticker: str) -> str:
    """This tool will provide the annual balance sheet of the company.
    The input parameter is stock ticker prices and output will be
    annual balance sheet of the company"""
    logger.debug("get_balance_sheet - Retrieving balance sheet.")
    stock = yf.Ticker(ticker)
    balance_sheet = stock.balance_sheet.to_json()
    return balance_sheet

@tool
@tracer.capture_method
def get_cash_flow(ticker: str) -> str:
    """This tool will provide the annual cash flow of the company.
    The input parameter is stock ticker prices and output will be
    annual cash flow of the company"""

    logger.debug("get_cash_flow - Retrieving cash flow.")
    stock = yf.Ticker(ticker)
    cash_flow = stock.cashflow.to_json()
    return cash_flow

@tool
@tracer.capture_method
def get_latest_news(ticker: str) -> str:
    """This tool will provide the latest news about the company.
    The input parameter is stock ticker prices and output will be
    latest news about the company"""

    logger.debug("get_latest_news - Retrieving latest news.")
    stock = yf.Ticker(ticker)
    return json.dumps(stock.news)


# Define the custom income statement fetching tool
class InvestmentAnalysisTool(BaseTool):
    name: Type[BaseModel] = "InvestmentAnalysisTool"
    description: Type[BaseModel] = "Analyze investment or stock based on query provided by the user"
    args_schema: Type[BaseModel] = InvestmentAnalysisInput

    # Function to fetch the annual income statement using yfinance
    @tracer.capture_method
    def _analyze_investments(ticker: str) -> str:
        try:
            stock = yf.Ticker(ticker)
            income_statement = stock.income_stmt
            if income_statement.empty:
                return f"No income statement data available for {ticker}."

            # return f"Income statement for {ticker} (annual):{income_statement}"
            resp = {'income_statement': income_statement.to_json()}

        except Exception as e:
            return (
                f'Error fetching the income statement for "{ticker}": {e}.'
                " Please make sure to provide a valid stock ticker."
            )

    @tracer.capture_method
    def _run(
        self, query: Union[str, dict], run_manager: Optional[CallbackManagerForToolRun] = None
    ) -> str:
        """Fetch the income statement."""
        logger.info("Query: ", query)

        try:
            if isinstance(query, str):
                # Use the query directly as the ticker
                ticker = query.strip()
            elif isinstance(query, dict):
                # Use the structured input directly
                ticker = query.get('ticker')
            else:
                return "Invalid input format. Please provide input as 'ticker' or a dictionary with 'ticker'."
            
            # Fetch the income statement using the parsed ticker
            return _analyze_investments(ticker)
        except Exception as e:
            return (
                f"Failed to fetch the income statement with error: {e}. "
                "Please provide a valid stock ticker symbol."
            )
    @tracer.capture_method
    async def _arun(
        self, query: Union[str, dict], run_manager: Optional[AsyncCallbackManagerForToolRun] = None
    ) -> str:
        """Fetch the income statement asynchronously."""
        raise NotImplementedError("IncomeStatementTool does not support async operations.")

# Example usage of the IncomeStatementTool
if __name__ == "__main__":
    income_statement_tool = InvestmentAnalysisTool()

    # Test the tool with a sample ticker for the annual income statement
    query = "AMZN"
    response = income_statement_tool._run(query)
    logger.info(response)

    # Test the tool with a structured input
    #query = {"ticker": "ZM"}
    #response = income_statement_tool._run(query)
    #logger.info(response)