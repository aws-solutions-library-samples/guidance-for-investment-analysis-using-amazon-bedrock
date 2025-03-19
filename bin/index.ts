#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { IConstruct } from "constructs";
import "source-map-support/register";
import { FrontEndStack } from "../lib/frontend_infra";
import { GenAIInfraStack } from "../lib/genai_infra";

const app = new cdk.App();

const genai_infra = new GenAIInfraStack(app, "InvestmentAnalystGPInfrStack", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  description : "Guidance for Investment Analysis Using Amazon Bedrock (SO9563)"
});

const frontEndStack = new FrontEndStack(app, "InvestmentAnalystGPFrontEndStack", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
  description : "Guidance for Investment Analysis Using Amazon Bedrock (SO9563)",
  investmentAnalystKBKnowledgeBaseId: genai_infra.investmentAnalystKBKnowledgeBaseId,
  gentNewsSentimentAttrAgentId: genai_infra.gentNewsSentimentAttrAgentId,
  agentAliasNewsSentimentAttrAgentAliasId: genai_infra.agentAliasNewsSentimentAttrAgentAliasId,
  powerToolsLayer: genai_infra.powerToolsLayer,
  bedrockGuardrailsId: genai_infra.bedrockGuardrailsId,
  bedrockGuardrailsVersion: genai_infra.bedrockGuardrailsVersion,
});

frontEndStack.addDependency(genai_infra);

cdk.Tags.of(genai_infra).add('SOLUTION_ID', 'SO9563');
cdk.Tags.of(genai_infra).add('ENV', 'POC');
class PathTagger implements cdk.IAspect {
  visit(node: IConstruct) {
    if (node ! instanceof cdk.aws_opensearchserverless.CfnCollection) {
      new cdk.Tag("aws-cdk-path", node.node.path).visit(node);
    }
  }
}
 
cdk.Aspects.of(genai_infra).add(new PathTagger()) ;
cdk.Tags.of(frontEndStack).add('SOLUTION_ID', 'SO9563');
cdk.Tags.of(frontEndStack).add('ENV', 'POC');
cdk.Aspects.of(frontEndStack).add(new PathTagger()) ;
cdk.Aspects.of(app).add(new AwsSolutionsChecks({}));

// Suppress Cognito User Pool requirements, as we're using Identity Pools and AWS_IAM for access control to API
NagSuppressions.addStackSuppressions(genai_infra, [
  { id: 'AwsSolutions-COG4', reason: 'Using Identity pools and AWS_IAM access control' },
]);

NagSuppressions.addStackSuppressions(frontEndStack, [
  { id: 'AwsSolutions-COG4', reason: 'Using Identity pools and AWS_IAM access control' },
]);

NagSuppressions.addStackSuppressions(frontEndStack, [
  { id: 'AwsSolutions-S5', reason: 'Using Origin Access Control and Origin Identity Protocol for Website S3 Bucket.' },
]);

NagSuppressions.addStackSuppressions (frontEndStack, [
  { id: 'AwsSolutions-L1', reason: 'CDK Website Deployment Construct...' },
]);

NagSuppressions.addStackSuppressions (frontEndStack, [
  { id: 'AwsSolutions-IAM5', reason: 'CDK Website Deployment Construct...' },
]);

NagSuppressions.addStackSuppressions (frontEndStack, [
  { id: 'AwsSolutions-IAM4', reason: 'CDK Website Deployment Construct...' },
]);

NagSuppressions.addStackSuppressions (genai_infra, [
  { id: 'AwsSolutions-IAM5', reason: 'CDK Website Deployment Construct...' },
]);

NagSuppressions.addStackSuppressions (genai_infra, [
  { id: 'AwsSolutions-IAM4', reason: 'CDK Website Deployment Construct...' },
]);

NagSuppressions.addStackSuppressions (genai_infra, [
  { id: 'AwsSolutions-L1', reason: 'Dependencies on libraries used.' },
]);     