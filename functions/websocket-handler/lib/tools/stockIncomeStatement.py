from typing import Optional, Type, Union

import yfinance as yf
from aws_lambda_powertools import Logger, Tracer
from langchain.callbacks.manager import (AsyncCallbackManagerForToolRun,
                                         CallbackManagerForToolRun)
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

logger = Logger(service="stock_income_statement_tool")
tracer = Tracer(service="stock_income_statement_tool")

# Define the input schema for the income statement tool
class IncomeStatementInput(BaseModel):
    ticker: str = Field(description="The stock ticker symbol to fetch the income statement for.")

# Function to fetch the annual income statement using yfinance
@tracer.capture_method
def _fetch_income_statement(ticker: str) -> str:
    try:
        stock = yf.Ticker(ticker)
        #income_statement = stock.financials  # Fetch only the annual financials
        income_statement = stock.quarterly_incomestmt
        if income_statement.empty:
            return f"No income statement data available for {ticker}."

        # Convert the Dataframe to a JSON format
        income_statement_str = income_statement.to_json(date_format="iso")
        response = {'income_statement': income_statement_str}
        return response
    
    except Exception as e:
        logger.exception(f"Error in IncomeStatementTool: {e}")
        return (
            f'Error fetching the income statement for "{ticker}": {e}.'
            " Please make sure to provide a valid stock ticker."
        )

# Define the custom income statement fetching tool
class IncomeStatementTool(BaseTool):
    name: Type[BaseModel] = "IncomeStatementFetcher"
    description: Type[BaseModel] = "Fetches the annual income statement for a given ticker symbol."
    args_schema: Type[BaseModel] = IncomeStatementInput

    @tracer.capture_method
    def _run(
        self, query: Union[str, dict], run_manager: Optional[CallbackManagerForToolRun] = None
    ) -> str:
        """Fetch the income statement."""
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
            return _fetch_income_statement(ticker)
        except Exception as e:
            logger.exception(f"Error in IncomeStatementTool: {e}")
            return (
                f"Failed to fetch the income statement with error: {e}. "
                "Please provide a valid stock ticker symbol."
            )

    async def _arun(
        self, query: Union[str, dict], run_manager: Optional[AsyncCallbackManagerForToolRun] = None
    ) -> str:
        """Fetch the income statement asynchronously."""
        raise NotImplementedError("IncomeStatementTool does not support async operations.")

# Example usage of the IncomeStatementTool
if __name__ == "__main__":
    income_statement_tool = IncomeStatementTool()

    # Test the tool with a sample ticker for the annual income statement
    query = "AMZN"
    response = income_statement_tool._run(query)
    print(response)

    # Test the tool with a structured input
    #query = {"ticker": "ZM"}
    #response = income_statement_tool._run(query)
    #print(response)
