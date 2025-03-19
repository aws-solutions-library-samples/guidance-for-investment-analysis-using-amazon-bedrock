import os
import uuid
import boto3
import json
import re
from datetime import datetime
from pydantic import BaseModel
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler.api_gateway import Router

tracer = Tracer()
router = Router()
logger = Logger()

logger.info(f"boto3 version = {boto3.__version__}")

bedrock_agent_runtime = boto3.client("bedrock-agent-runtime", region_name="us-east-1")

agent_id = "WUZ13VWYMN"
agent_alias_id = "RHK54CGDDZ"

@router.post("/tickernews")
@tracer.capture_method
def news():
    data: dict = router.current_event.json_body

    logger.info(data)
    
    data = fetch_news_and_sentiments(data)
    if data:
        # Display news in tabular format
        print("\nNews:")
        news_list = data["news"]
        for news in news_list:
            print(f"- Title: {news['title']}")
            if 'summary' in news:
                print(f"  Summary: {news['summary']}")
            if 'source' in news:
                print(f"  Source: {news['source']}")
            if 'url' in news:
                print(f"  URL: {news['url']}")
            if 'ticker_sentiment_label' in news:
                print(f"  Sentiment: {news['ticker_sentiment_label']}")
            if 'ticker_sentiment_score' in news:
                print(f"  Sentiment Score: {news['ticker_sentiment_score']}")
            print("\n")
        
        # Display summary
        print("Summary:")
        print(data["summary"])
    else:
        print("Failed to fetch data. Please check the ticker or try again later.")


    return {"ok": True, "response":data}

# Function to generate a unique session ID
def generate_session_id():
    """Generate a unique session ID."""
    return str(uuid.uuid4())

# Function to invoke the Bedrock agent
def invoke_agent(agent_id, agent_alias_id, session_id, prompt):
    """
    Sends a prompt for the agent to process and respond to.

    :param agent_id: The unique identifier of the agent to use.
    :param agent_alias_id: The alias of the agent to use.
    :param session_id: The unique identifier of the session. Use the same value across requests
                       to continue the same conversation.
    :param prompt: The prompt that you want the agent to complete.
    :return: Inference response from the model.
    """
    try:
        response = bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId=agent_alias_id,
            sessionId=session_id,
            inputText=prompt,
        )

        completion = ""
        for event in response.get("completion"):
            chunk = event["chunk"]
            completion += chunk["bytes"].decode()

        # Log the completion for debugging purposes
        print("Completion response:", completion)

        return completion

    except boto3.exceptions.Boto3Error as e:
        print(f"Couldn't invoke agent. {e}")
        raise

# Function to parse the raw response
def parse_response(response):
    try:
        # Extract the <news> and <summary> sections using regex
        news_section = re.search(r'<news>(.*?)</news>', response, re.DOTALL).group(1).strip()
        summary_section = re.search(r'<summary>(.*?)</summary>', response, re.DOTALL).group(1).strip()

        # Split the news section into individual JSON objects
        news_items = re.findall(r'{(.*?)}', news_section, re.DOTALL)
        
        # Parse each JSON object and add to the list
        news_json = []
        for item in news_items:
            item_json = json.loads(f'{{{item}}}')
            news_json.append(item_json)

        return {
            "news": news_json,
            "summary": summary_section
        }
    except Exception as e:
        print("Error parsing response:", e)
        return None

# Function to fetch news and sentiment data
def fetch_news_and_sentiments(ticker):
    session_id = generate_session_id()
    prompt = f"Provide the latest news and sentiment analysis for {ticker}, including the URL of each news article."
    response = invoke_agent(agent_id, agent_alias_id, session_id, prompt)

    # Log the response for debugging purposes
    print("Raw response:", response)

    # Parse the response
    parsed_response = parse_response(response)
    print("Parsed response:", parsed_response)
    
    return json.loads(response)
