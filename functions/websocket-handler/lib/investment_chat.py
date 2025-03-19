import os

import boto3
from aws_lambda_powertools import Logger, Tracer
from langchain.agents import Tool
from langchain.tools.retriever import create_retriever_tool
from langchain_aws import ChatBedrock
from langchain_aws.retrievers import AmazonKnowledgeBasesRetriever
from langchain_community.chat_message_histories import \
    DynamoDBChatMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from lib.tools.investment_analysis_tool import (InvestmentAnalysisTool,
                                                get_latest_news,
                                                get_price_history,
                                                get_recommendations,
                                                search_knowledge_base)
from lib.tools.stockPrice import StockPriceTool

logger = Logger(service="investment_analysis")
tracer = Tracer(service="investment_analysis")
import markdown

LLM_MODEL_ID = os.environ["LLM_MODEL_ID"]
KB_ID = os.environ["KB_ID"]
CHAT_HISTORY_TBL_NM = os.environ["CHAT_HISTORY_TBL_NM"]
GUARDRAILS_ID = os.environ["BEDROCK_GUARDRAILSID"]
GUARDRAIL_VERSION = os.environ["BEDROCK_GUARDRAILSVERSION"]

bedrock_region = os.environ["AWS_REGION"]
bedrock_runtime = boto3.client("bedrock-runtime", region_name=bedrock_region)

logger.info(f"KB_ID : {KB_ID}")

nova_chat_llm = ChatBedrock(
    model_id=LLM_MODEL_ID,
    client=bedrock_runtime,
    model_kwargs={"temperature": 0.2, "top_p": 0.99, "max_tokens": 4096},
    guardrails={"guardrailIdentifier": GUARDRAILS_ID, "guardrailVersion": GUARDRAIL_VERSION},
    disable_streaming=True
)

amzn_kb_retriever = AmazonKnowledgeBasesRetriever(
    knowledge_base_id=KB_ID,
    retrieval_config={"vectorSearchConfiguration": {"numberOfResults": 3}},
)

kb_retriever_tool = create_retriever_tool(
    retriever=amzn_kb_retriever,
    name="knowledge_base",
    description="""This tool provides the historical news related to stock market. 
    Use this tool to get information about sector, to know the key players in a sector
    or to understand the policies and what other companies are doing. 
	""",
)

stock_price = StockPriceTool()
investment_analysis_tool = InvestmentAnalysisTool()
LLM_AGENT_TOOLS = [
    Tool(
        name="search_knowledge_base",
        func=search_knowledge_base,
        description="""This tool provides the historical news related to stock market. 
        Use this tool to get information about sector, to know the key players in a sector
        or to understand the policies and what other companies are doing. 
        """,
    ),
    Tool(
        name="get_price_history",
        func=get_price_history,
        description="""This tool will provide the stock prices of past 6 months.
        The input parameter is stock ticker prices and output will be
        history of end of the day price for past 6 months""",
    ),
    Tool(
        name="get_recommendations",
        func=get_recommendations,
        description="""This tool will provide the recommendations based on the investment analysis.
        The input parameter is stock ticker prices and output will be
        recommendations based on the investment analysis""",
    ),
    Tool(
        name="get_latest_news",
        func=get_latest_news,
        description="""This tool will provide the latest news related to stock market.
        The input parameter is stock ticker prices and output will be
        latest news related to stock market""",
    ),
    Tool(
        name="StockPrice",
        func=stock_price,
        description="Use this tool when you need to retrieve current stock price and historical price.",
    )
]


def chat_investment(user_input, socket_conn_id):
    nova_chat_llm.bind_tools(LLM_AGENT_TOOLS)
    history = DynamoDBChatMessageHistory(
        table_name=CHAT_HISTORY_TBL_NM,
        session_id=socket_conn_id
    )
    print(f'history: {history.messages}')
    prompt = ChatPromptTemplate.from_messages(
    [
        ("system", "You are a helpful assistant."),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{question}"),
    ])

    chain = prompt | nova_chat_llm

    chain_with_history = RunnableWithMessageHistory(
        chain,
        lambda session_id: history,
        input_messages_key="question",
        history_messages_key="history",
    )
    response = chain_with_history.invoke({"question": user_input}, {"configurable": {"session_id": socket_conn_id}})
    logger.info(f"chat response: {response.content}")
    return markdown.markdown(response.content)