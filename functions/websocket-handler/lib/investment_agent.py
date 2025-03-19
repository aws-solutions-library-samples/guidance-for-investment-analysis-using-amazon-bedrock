# investment_agent.py

import json
import os

import boto3
from aws_lambda_powertools import Logger, Tracer
from langchain.agents import AgentExecutor, Tool, create_json_chat_agent
from langchain.tools.retriever import create_retriever_tool
from langchain_aws import ChatBedrock
from langchain_aws.retrievers import AmazonKnowledgeBasesRetriever
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from lib.prompts.investment_analysis_prompt import InvestmentAnalysisPrompt
from lib.tools.investment_analysis_tool import (InvestmentAnalysisOutput,
                                                InvestmentAnalysisTool,
                                                get_cash_flow,
                                                get_income_statement,
                                                get_latest_news,
                                                get_price_history,
                                                get_recommendations,
                                                search_knowledge_base)

logger = Logger(service="investment_analysis")
tracer = Tracer(service="investment_analysis")

LLM_MODEL_ID = os.environ["LLM_MODEL_ID"]
KB_ID = os.environ["KB_ID"]

bedrock_region = os.environ["AWS_REGION"]
bedrock_runtime = boto3.client("bedrock-runtime", region_name=bedrock_region)

logger.info(f"KB_ID : {KB_ID}")

nova_chat_llm = ChatBedrock(
    model_id=LLM_MODEL_ID,
    client=bedrock_runtime,
    model_kwargs={"temperature": 0.2, "top_p": 0.99, "max_tokens": 4096},
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

# Initialize tools
#stock_price = StockPriceTool()
#income_statement = IncomeStatementTool()
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
        name="get_income_statement",
        func=get_income_statement,
        description="""This tool will provide the annual income statement of the company.
        The input parameter is stock ticker prices and output will be
        annual income statement of the company""",
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
        name="get_cash_flow",
        func=get_cash_flow,
        description="""This tool will provide the cash flow of the company.
        The input parameter is stock ticker prices and output will be
        cash flow of the company""",
    )
]

@tracer.capture_method
def _handle_error(error) -> str:
    logger.info("---"*80)
    logger.info(f"Am I successful in capturing an error?: {error}")
    logger.info("---"*80)
    return str(error)[:50]

@tracer.capture_method
def get_agentic_chain(user_input, verbose=True):
    logger.info("Creating XML Agent")
    # Create the XML agent with the specified prompt and tools
    parser = PydanticOutputParser(pydantic_object=InvestmentAnalysisOutput)

    prompt = ChatPromptTemplate(
        messages = InvestmentAnalysisPrompt.messages,
        input_variables=["input", "agent_scratchpad", "chat_history"],
        partial_variables={
            "format_instructions": parser.get_format_instructions(),
            "tool_names": ", ".join([tool.name for tool in LLM_AGENT_TOOLS]),
        }
    )

    agent = create_json_chat_agent(    
        nova_chat_llm,
        LLM_AGENT_TOOLS,
        prompt
    )

    # Setting the verbose mode to false to prevent lots of messages. 
    verbose = True

    # Define the agent executor
    logger.info("Creating Agent Executor")
    agent_executor = AgentExecutor(
        agent=agent,
        tools=LLM_AGENT_TOOLS,
        return_intermediate_steps=True,  # Capture intermediate steps
        verbose=verbose,
        max_iterations=10,  # Setting max iteration to avoid loop.
        handle_parsing_errors=_handle_error
    )
    return agent_executor

@tracer.capture_method
def analyze_investment(user_input):
    # Get the agentic chain with the specified parameters
    conversation_chain = get_agentic_chain(user_input)

    try:
        # Invoke the agent to get the response with intermediate steps
        response = conversation_chain.invoke({"input": user_input})
        # Extract the final output and intermediate steps
        logger.info("response = %s", response)
        final_output = response.get("output", "")
        final_output = f"{final_output}"

        knowledge = price_history = latest_news = recommendations = ""

        intermediate_steps = response.get("intermediate_steps", [])
        for action, log in intermediate_steps:
            logger.info(f"action = {action}, log = {log}")
            if "search_knowledge_base" in action.tool:
                knowledge = log
            elif "get_price_history" in action.tool:
                price_history = log
            elif "get_recommendations" in action.tool:
                recommendations = log
            elif "get_latest_news" in action.tool:
                latest_news = log

        investment_response = {
            "investment_summary": final_output,
            "recommendation": recommendations,
            "price_history": price_history,
            "latest_news": latest_news,
            "knowledge": knowledge
        }
        logger.info(f"investment_response = {json.dumps(investment_response)}")
        return investment_response
    except Exception as e:
        logger.exception(f"Failed to generate report: {str(e)}")    
        return str(e), None


# Example usage
if __name__ == "__main__":
    
    analyze_investment("GOOGL")
