# financial_analysis.py

import os
import traceback

import boto3
from aws_lambda_powertools import Logger, Tracer
from langchain.agents import AgentExecutor, Tool, create_json_chat_agent
from langchain_aws import ChatBedrock
from langchain_core.prompts import ChatPromptTemplate
from lib.prompts.financial_analysis_prompt import FinancialAnalysisPrompt
from lib.tools.stockIncomeStatement import IncomeStatementTool
from lib.tools.stockPrice import StockPriceTool

logger = Logger(service="financial_analysis")
tracer = Tracer(service="financial_analysis")

LLM_MODEL_ID = os.environ["LLM_MODEL_ID"]

bedrock_region = os.environ["AWS_REGION"]
bedrock_runtime = boto3.client("bedrock-runtime", region_name=bedrock_region)
claude_chat_llm = ChatBedrock(
    model_id=LLM_MODEL_ID,
    client=bedrock_runtime,
    model_kwargs={"temperature": 0.0, "top_p": 0.99, "max_tokens": 4096},
    disable_streaming=True
)

# Initialize tools
stock_price = StockPriceTool()
income_statement = IncomeStatementTool()
LLM_AGENT_TOOLS = [
    Tool(
        name="StockPrice",
        func=stock_price,
        description="Use this tool when you need to retrieve current stock price and historical price.",
    ),
    Tool(
        name="IncomeStatement",
        func=income_statement,
        description="Use this tool when you need to retrieve current stocks income statement.",
    ),
]



@tracer.capture_method
def _handle_error(error) -> str:
    logger.exception("---"*80)
    logger.exception(f"Check your output and make sure it conforms!: {error}")
    logger.exception("---"*80)
    return str(error)

@tracer.capture_method
def get_agentic_chain(user_input, verbose=True):
    # Create the XML agent with the specified prompt and tools
    # agent = create_xml_agent(
    agent = create_json_chat_agent(
        llm=claude_chat_llm,
        tools=LLM_AGENT_TOOLS,
        prompt=ChatPromptTemplate.from_messages(FinancialAnalysisPrompt.messages),
    )

    # Define the agent executor
    agent_executor = AgentExecutor(
        agent=agent,
        tools=LLM_AGENT_TOOLS,
        return_intermediate_steps=True,  # Capture intermediate steps
        verbose=verbose,
        handle_parsing_errors=_handle_error
    )
    return agent_executor

@tracer.capture_method
def analyze_financials(user_input):
    # Get the agentic chain with the specified parameters
    conversation_chain = get_agentic_chain(user_input)

    try:
        # Invoke the agent to get the response with intermediate steps
        response = conversation_chain.invoke({"input": user_input, "chat_history": []})

        logger.info(f"response: {response}")
        # Extract the final output and intermediate steps
        final_output = response.get("output", "")
        logger.info(f"final_output: {final_output}")
        sections = final_output.split("\n\n")
        resp_overall_summary = sections[0]
        resp_analysis_secs = {}
        conclusion = ""
        for section in sections[1:]:
            logger.info(f"section: {section}")
            section_parts = section.split(":")
            if len(section_parts) > 1:
                resp_analysis_secs[section_parts[0]] =  "\\".join(section_parts[1:]).replace("\\n", "\\")
            else:
                conclusion = f"{conclusion} {section_parts[0]}"
        intermediate_steps = response.get("intermediate_steps", [])
        conclusion = f"{conclusion}"

        income_statement_data = None
        for action, result in intermediate_steps:
            if "IncomeStatement" in action.tool:
                income_statement_data = result
                break

        financials_response = {
            "financial_summary": {
                "overall_summary": resp_overall_summary,
                "analysis": resp_analysis_secs,
            },
            "conclusion": conclusion,
            "income_statement": income_statement_data
        }
        logger.info(f"financials_response: {financials_response}")
        return financials_response

    except Exception as e:
        logger.info(f"Failed to generate report: {str(e)}")
        traceback.print_exc() 
        return str(e), None

# Example usage
if __name__ == "__main__":
    
    analyze_financials("GOOGL")
