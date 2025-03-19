import json
import os
import uuid

import boto3
from aws_lambda_powertools import Logger, Tracer
from botocore.config import Config

LLM_MODEL_ID = os.environ["LLM_MODEL_ID"]

tracer = Tracer(service="news_analysis_agent")
logger = Logger(service="news_analysis_agent")

logger.info(f"boto3 version = {boto3.__version__}")

config = Config(read_timeout=1000) # overriding default timeout with longer timeout.
region = os.environ["AWS_REGION"]
bedrock_agent_runtime = boto3.client("bedrock-agent-runtime", region_name=region, config=config)

agent_id = os.environ["AGENT_ID"]
agent_alias_id = os.environ["AGENT_ALIAS_ID"]

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
@tracer.capture_method
def generate_session_id():
    """Generate a unique session ID."""
    return str(uuid.uuid4())
    
# Function to invoke the Bedrock agent
@tracer.capture_method
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
        logger.info(f"Invoking agent agsinst agent - {agent_id} and alias - {agent_alias_id}....")
        response = bedrock_agent_runtime.invoke_agent(
            agentId=agent_id,
            agentAliasId=agent_alias_id,
            sessionId=session_id,
            inputText=prompt,
            enableTrace=False,
        )
        
        event_stream = response['completion']
        final_answer = ""
        try:
            for event in event_stream:
                if 'chunk' in event:
                    data = event['chunk']['bytes']
                    final_answer = final_answer + data.decode('utf8')
                elif 'trace' in event:
                    logger.info(json.dumps(event['trace'], indent=2))
                else: 
                    raise Exception("unexpected event.", event)
        except Exception as e:
            raise Exception("unexpected event.",e)
        
        pos = final_answer.index('{\n  \"news\":')
        final_answer_json = final_answer[pos:]
        logger.info(f"final_answer_json = {final_answer_json}")
        decoder = json.JSONDecoder()
        return decoder.decode(final_answer_json)

    except boto3.exceptions.Boto3Error as e:
        logger.exception(f"Couldn't invoke agent. {e}")
        raise

# Function to fetch news and sentiment data
@tracer.capture_method
def fetch_news_and_sentiments(ticker):
    logger.info(f"fetching news and sentiment for {ticker}")
    session_id = generate_session_id()
    prompt = f"Provide the latest news and sentiment analysis for {ticker}, including the URL of each news article. Answer in JSON Format."
    response = invoke_agent(agent_id, agent_alias_id, session_id, prompt)

    return response
