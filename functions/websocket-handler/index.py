import json
import os

import boto3
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.logging import correlation_paths
from botocore.exceptions import ClientError
from lib.financial_analysis import analyze_financials
from lib.investment_agent import analyze_investment
from lib.investment_chat import chat_investment
from lib.news import fetch_news_and_sentiments

logger = Logger(service="investment-analyst-websocket-handler")
tracer = Tracer(service="investment-analyst-websocket-handler")

table_name = os.environ["WEBSOCKET_TBL_NM"]

@tracer.capture_method
def handle_connect(principal_id, table, connection_id, email):
    status_code = 200
    try:
        table.put_item(Item={"connection_id": connection_id, "principal_id": principal_id, "email": email})
        logger.info("Added connection %s for user %s.", connection_id, principal_id)
    except ClientError:
        logger.exception(
            "Couldn't add connection %s for user %s.", connection_id, principal_id
        )
        status_code = 503
    return status_code

@tracer.capture_method
def handle_disconnect(table, connection_id):
    status_code = 200
    try:
        table.delete_item(Key={"connection_id": connection_id})
        logger.info("Disconnected connection %s.", connection_id)
    except ClientError:
        logger.exception("Couldn't disconnect connection %s.", connection_id)
        status_code = 503
    return status_code

@tracer.capture_method
def handle_message(table, connection_id, event_body, apig_management_client):
    status_code = 200
    user_name = "guest"
    try:
        item_response = table.get_item(Key={"connection_id": connection_id})
        user_name = item_response["Item"]["user_name"]
        logger.info("Got user name %s.", user_name)
    except ClientError:
        logger.exception("Couldn't find user name. Using %s.", user_name)

    connection_ids = []
    try:
        scan_response = table.scan(ProjectionExpression="connection_id")
        connection_ids = [item["connection_id"] for item in scan_response["Items"]]
        logger.info("Found %s active connections.", len(connection_ids))
    except ClientError:
        logger.exception("Couldn't get connections.")
        status_code = 404

    message = f"{user_name}: {event_body['msg']}".encode()  # utf-8
    logger.info("Message: %s", message)

    for other_conn_id in connection_ids:
        try:
            if other_conn_id != connection_id:
                send_response = apig_management_client.post_to_connection(
                    Data=message, ConnectionId=other_conn_id
                )
                logger.info(
                    "Posted message to connection %s, got response %s.",
                    other_conn_id,
                    send_response,
                )
        except ClientError:
            logger.exception("Couldn't post to connection %s.", other_conn_id)
        except apig_management_client.exceptions.GoneException:
            logger.info("Connection %s is gone, removing.", other_conn_id)
            try:
                table.delete_item(Key={"connection_id": other_conn_id})
            except ClientError:
                logger.exception("Couldn't remove connection %s.", other_conn_id)

    return status_code

def send_response(domain_nm, stg, connection_id, response):
    try:
        apig_management_client = boto3.client(
            "apigatewaymanagementapi",
            endpoint_url=f"https://{domain_nm}/{stg}",
        )
        send_response = apig_management_client.post_to_connection(
            Data=json.dumps(response).encode("utf-8"), ConnectionId=connection_id
        )
        logger.info("Sent response to connection %s, got %s.", connection_id, send_response)
    except ClientError as e:
        logger.error("Error sending response to connection %s: %s", connection_id, e)

@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_REST
)
def handler(event, context):
    
    logger.info("Event: %s", event)
    logger.info("Context: %s", context)

    route_key = event.get("requestContext", {}).get("routeKey")
    connection_id = event.get("requestContext", {}).get("connectionId")
    
    if table_name is None or route_key is None or connection_id is None:
        return {"statusCode": 400}

    table = boto3.resource("dynamodb").Table(table_name)
    logger.info("Request: %s, use table %s.", route_key, table.name)

    response = {"statusCode": 200, "body": "OK"}
    req_recvd_response = {"statusCode": 200, "body": "RECEIVED"}
    if route_key == "$connect":
        principalId = event["requestContext"]["authorizer"]["principalId"]
        user_email = event["requestContext"]["authorizer"]["email"]
        response["statusCode"] = handle_connect(principalId, table, connection_id, user_email)
    elif route_key == "$disconnect":
        response["statusCode"] = handle_disconnect(table, connection_id)
    elif route_key == "$default":

        body = event.get("body")
        if body is not None:
            body = json.loads(body)
        else:
            body = {"msg": ""}
        domainName = event.get("requestContext", {}).get("domainName")
        stg = event.get("requestContext", {}).get("stage")
        if domainName is None or stg is None:
            logger.exception(
                "Couldn't send message. Bad endpoint in request: domain '%s', "
                "stage '%s'",
                domainName,
                stg,
            )
            response["statusCode"] = 400
        else:
            if body["action"] == "getTickerNews":
                logger.info(f"Received getTickerNews request for {body['tickr']}")
                send_response(domainName, stg, connection_id, req_recvd_response) # Responding with request received to avoid connection timeout
                news_response = fetch_news_and_sentiments(body['tickr'])
                send_response(domainName, stg, connection_id, news_response)
                logger.info("Posted message to connection %s, got response %s.", connection_id, send_response)
            elif body["action"] == "getFundamentalAnalysis":
                tickr = body['tickr']
                logger.info(f"Received getFundamentalAnalysis request for: {tickr}")
                send_response(domainName, stg, connection_id, req_recvd_response) # Responding with request received to avoid connection timeout
                fundamental_analysis_response = analyze_financials(f"{tickr}? Answer in JSON Format.")
                send_response(domainName, stg, connection_id, fundamental_analysis_response)
            elif body["action"] == "getInvestmentAnalysis":
                tickr = body['tickr']
                logger.info(f"Received getInvestmentAnalysis request for: {tickr}")
                send_response(domainName, stg, connection_id, req_recvd_response) # Responding with request received to avoid connection timeout
                user_input = f"{tickr}? Answer in JSON Format."
                investment_response = analyze_investment(user_input)
                response = {"statusCode": 200, "body": {
                    "investment_response": investment_response}}    
                send_response(domainName, stg, connection_id, response)
            elif body["action"] == "getFinancialData":
                tickr = body['tickr']
                logger.info(f"Received getFinancialData request for: {tickr}")
                send_response(domainName, stg, connection_id, req_recvd_response) # Responding with request received to avoid connection timeout
                user_input = f"{tickr}. Answer in JSON Format."
                investment_response = analyze_investment(user_input)
                response = {"statusCode": 200, "body": {
                    "investment_response": investment_response}}
                send_response(domainName, stg, connection_id, response)
            elif body["action"] == "getQualitativeQnA":
                tickr = body['tickr']
                logger.info(f"Received getQualitativeQnA request for: {tickr}")
                send_response(domainName, stg, connection_id, req_recvd_response) # Responding with request received to avoid connection timeout
                send_response(domainName, stg, connection_id, "getQualitativeQnA")
            elif body["action"] == "chat":
                question = body['question']
                logger.info(f"Received chat request for: {question}")
                send_response(domainName, stg, connection_id, req_recvd_response) # Responding with request received to avoid connection timeout
                chat_response = chat_investment(question, connection_id)
                send_response(domainName, stg, connection_id, str(chat_response))
            else:
                response["statusCode"] = 404
    else:
        response["statusCode"] = 404

    logger.info(f"prepared response: {response}")
    return response