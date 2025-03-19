import json
import os

import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.logging import correlation_paths

tracer = Tracer()
logger = Logger()

@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_REST
)
@tracer.capture_lambda_handler
def handler(event, context):
    try:
        agent = event['agent']
        actionGroup = event['actionGroup']
        function = event['function']
        parameters = event.get('parameters', [])
        
        # Get the input parameters from environment variables
        apikey = os.environ.get('API_KEY')
        topics = os.environ.get('NEWS_TOPICS', 'earnings')
        limit = os.environ.get('NEWS_LIMIT', '10')

        # Access the 'ticker' value
        ticker = parameters[0]['value']
        logger.info(f"Ticker: {ticker}")

        base_url = 'https://www.alphavantage.co/query'
        url = f'{base_url}?function=NEWS_SENTIMENT&limit={limit}&tickers={ticker}&sort=LATEST&topics={topics}&apikey={apikey}'
        logger.info(f"Request URL: {url}")

        r = requests.get(url, timeout=180)
        data = r.json()

        # Check if the response contains news items
        if 'feed' in data:
            news_items = data['feed'][:int(limit)]  # Slice the list to get the top N items
            table_data = []
            for item in news_items:
                # Check if the news item has a 'ticker_sentiment' key
                if 'ticker_sentiment' in item:
                    # Find the sentiment for the specified ticker
                    for ticker_sentiment in item['ticker_sentiment']:
                        if ticker_sentiment['ticker'].lower() == ticker.lower():
                            row = {
                                'title': item['title'].replace('"', ''),
                                'summary': item['summary'].replace('"', ''),
                                'url': item['url'],
                                'time_published': item['time_published'],
                                'authors': ', '.join(item['authors']),
                                'source': item['source'],
                                'ticker': ticker_sentiment['ticker'],
                                'ticker_sentiment_score': ticker_sentiment['ticker_sentiment_score'],
                                'ticker_sentiment_label': ticker_sentiment['ticker_sentiment_label']
                            }
                            table_data.append(row)
                            break  # Exit the inner loop after finding the sentiment

            response_body = {
                'TEXT': {
                    'body': json.dumps(table_data)
                }
            }
        else:
            logger.info("No news items found in the response.")
            response_body = {
                'TEXT': {
                    'body': json.dumps([{'error': 'No news items found in the response.'}])
                }
            }

        function_response = {
            'actionGroup': actionGroup,
            'function': function,
            'functionResponse': {
                'responseBody': response_body
            }
        }

        session_attributes = event.get('sessionAttributes', {})
        prompt_session_attributes = event.get('promptSessionAttributes', {})

        action_response = {
            'messageVersion': '1.0',
            'response': function_response,
            'sessionAttributes': session_attributes,
            'promptSessionAttributes': prompt_session_attributes
        }

        logger.info(f"API Response: {json.dumps(action_response, indent=2)}")
        
        return action_response

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json'
            }
        }
