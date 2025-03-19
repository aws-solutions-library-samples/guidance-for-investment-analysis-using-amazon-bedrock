from aws_lambda_powertools import Logger, Tracer
import os

import boto3
import time

logger = Logger(service="investment-analyst-websocket-handler")
tracer = Tracer(service="investment-analyst-websocket-handler")

KB_ID = os.environ["KB_ID"]
DS_ID = os.environ["DS_ID"]

br_agent_client = boto3.client('bedrock-agent')

def interactive_sleep(seconds: int):
    dots = ''
    for i in range(seconds):
        dots += '.'
        print(dots, end='\r')
        time.sleep(1)

@logger.inject_lambda_context(
    log_event=True
)
def handler(event, context):
    start_ingestion_job_response = br_agent_client.start_ingestion_job(
        knowledgeBaseId=KB_ID,
        dataSourceId=DS_ID,
    )

    get_ingestion_job_response = br_agent_client.get_ingestion_job(
        knowledgeBaseId=KB_ID,
        dataSourceId=DS_ID,
        ingestionJobId=start_ingestion_job_response['ingestionJob']['ingestionJobId']
    )

    while get_ingestion_job_response['ingestionJob']['status'] == "IN_PROGRESS":
        interactive_sleep(5)
        get_ingestion_job_response = br_agent_client.get_ingestion_job(
            knowledgeBaseId=KB_ID,
            dataSourceId=DS_ID,
            ingestionJobId=start_ingestion_job_response['ingestionJob']['ingestionJobId']
        )