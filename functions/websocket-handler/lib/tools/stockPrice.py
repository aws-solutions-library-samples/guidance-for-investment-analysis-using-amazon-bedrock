from datetime import datetime, timedelta
from typing import Optional, Type, Union

import pandas_market_calendars as mcal
import yfinance as yf
from aws_lambda_powertools import Logger, Tracer
from langchain.callbacks.manager import (AsyncCallbackManagerForToolRun,
                                         CallbackManagerForToolRun)
from langchain.tools import BaseTool
from pydantic import BaseModel, Field

logger = Logger(service="stock_price_tool")
tracer = Tracer(service="stock_price_tool")

# Define the input schema for the tool
class StockPriceInput(BaseModel):
    ticker: str = Field(description="The stock ticker symbol to fetch the price for.")
    date: Optional[str] = Field(default=None, description="The date to fetch the price for in 'YYYY-MM-DD' format. If not provided, fetches the current date price.")

# Function to check if a date is a trading day
@tracer.capture_method
def is_trading_day(date: datetime) -> bool:
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(start_date=date.strftime('%Y-%m-%d'), end_date=date.strftime('%Y-%m-%d'))
    return not schedule.empty

# Function to get the nearest previous trading day if the given date is not a trading day
@tracer.capture_method
def get_previous_trading_day(date: datetime) -> datetime:
    nyse = mcal.get_calendar('NYSE')
    schedule = nyse.schedule(start_date=(date - timedelta(days=30)).strftime('%Y-%m-%d'), end_date=date.strftime('%Y-%m-%d'))
    previous_trading_days = schedule[schedule.index < date]
    if not previous_trading_days.empty:
        return previous_trading_days.index[-1]
    return date

# Function to fetch stock price using yfinance
@tracer.capture_method
def _fetch_stock_price(ticker: str, date: Optional[str] = None) -> str:
    try:
        stock = yf.Ticker(ticker)
    
        if date:
            # Parse the provided date
            try:
                query_date = datetime.strptime(date, '%Y-%m-%d')
            except ValueError:
                logger.exception(f"Invalid date format: {date}. Please use 'YYYY-MM-DD'.")
                return "Invalid date format. Please use 'YYYY-MM-DD'."
            
            # Check if the date is in the future
            if query_date > datetime.now():
                return f"Cannot fetch data for future dates. Please provide a date that is today or earlier."
            
            # Check if the date is a trading day
            if not is_trading_day(query_date):
                previous_trading_day = get_previous_trading_day(query_date)
                query_date = previous_trading_day
                fallback_message = f"Note: {date} is a non-trading day. Using the previous trading day {query_date.strftime('%Y-%m-%d')}."
            else:
                fallback_message = ""

            # Fetch historical data for the specified date or the nearest previous trading day
            start_date = query_date.strftime('%Y-%m-%d')
            end_date = (query_date + timedelta(days=1)).strftime('%Y-%m-%d')
            history = stock.history(start=start_date, end=end_date)
            
            if history.empty:
                return f"No trading data available for {ticker} on {start_date}. This could be due to a market holiday or incorrect date."

            price = history['Close'].iloc[0]  # Get the closing price on the specified date
            return f"{fallback_message} The closing price of {ticker} on {query_date.strftime('%Y-%m-%d')} was ${price:.2f}"
        else:
            # Fetch the current price
            history = stock.history(period="1d")
            if history.empty:
                return f"No trading data available for {ticker} on the current date."
            
            price = history['Close'].iloc[-1]
            return f"The current price of {ticker} is ${price:.2f}"
            
    except Exception as e:
        logger.exception(f"Failed to fetch the stock price: {e}")
        return (
            f'Error fetching the stock price for "{ticker}": {e}.'
            " Please make sure to provide a valid stock ticker and date if specified."
        )

# Define the custom stock price fetching tool
class StockPriceTool(BaseTool):
    name: Type[BaseModel] = "StockPriceFetcher"
    description: Type[BaseModel] = "Fetches the stock price for a given ticker symbol on a specified date, or the current date if no date is provided."
    args_schema: Type[BaseModel] = StockPriceInput

    @tracer.capture_method
    def _run(
        self, query: Union[str, dict], run_manager: Optional[CallbackManagerForToolRun] = None
    ) -> str:
        """Fetch the stock price."""
        try:
            if isinstance(query, str):
                # Split the query into ticker and date if provided as a single string
                parts = [part.strip() for part in query.split(',')]
                ticker = parts[0]
                date = parts[1] if len(parts) > 1 else None
            elif isinstance(query, dict):
                # Use the structured input directly
                ticker = query.get('ticker')
                date = query.get('date', None)
            else:
                return "Invalid input format. Please provide input as 'ticker, date' or a dictionary with 'ticker' and optional 'date'."
            
            # Fetch the stock price using the parsed ticker and date
            return _fetch_stock_price(ticker, date)
        except Exception as e:
            logger.exception(f"Failed to fetch the stock price: {e}")
            return (
                f"Failed to fetch the stock price with error: {e}. "
                "Please provide a valid stock ticker symbol and date in 'YYYY-MM-DD' format if specified."
            )
        
    @tracer.capture_method
    async def _arun(
        self, query: Union[str, dict], run_manager: Optional[AsyncCallbackManagerForToolRun] = None
    ) -> str:
        """Fetch the stock price asynchronously."""
        raise NotImplementedError("StockPriceTool does not support async operations.")

# Example usage of the StockPriceAgent
if __name__ == "__main__":
    stock_tool = StockPriceTool()
  
    # Test the agent with a sample ticker for the current price
    query = "AAPL"
    response = stock_tool.run(query)
    logger.info(response)

    # Test the agent with a sample ticker for a specific date price
    query = "AAPL, 2024-06-01"
    response = stock_tool.run(query)
    logger.info(response)
  