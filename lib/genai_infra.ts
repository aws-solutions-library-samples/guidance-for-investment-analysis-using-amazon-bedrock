import * as lambdaPython from "@aws-cdk/aws-lambda-python-alpha";
import * as genai from '@cdklabs/generative-ai-cdk-constructs';
import * as cdk from "aws-cdk-lib";
// import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cr from "aws-cdk-lib/custom-resources";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import * as path from "node:path";

const lambdaArchitecture = lambda.Architecture.X86_64;

export class GenAIInfraStack extends cdk.Stack {

  public investmentAnalystKBKnowledgeBaseId: string;
  public gentNewsSentimentAttrAgentId: string;
  public agentAliasNewsSentimentAttrAgentAliasId: string;
  public powerToolsLayer: lambda.ILayerVersion;
  public bedrockGuardrailsId: string;
  public bedrockGuardrailsVersion: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ALPHA_VANTAGE_APIKEY = this.node.tryGetContext('ALPHA_API_KEY');

    const kbInvestmentResearchS3 = new s3.Bucket(this, "kbInvestmentResearchDocs", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true
    });

    const investmentResearchDocs = new s3deploy.BucketDeployment(this, 'InvestmentResearchDocsUpload', {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../invest-research-docs/"))],
      destinationBucket: kbInvestmentResearchS3,
    });

    const investmentAnalystVecKB = new genai.bedrock.VectorKnowledgeBase(this,
      'InvestmentAnalystVecKB', {
      embeddingsModel: genai.bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      name: "InvestmentAnalystVecKB",
    });

    const investmentAnalystKBS3Ds = new genai.bedrock.S3DataSource(this,
      'InvestmentAnalystKBS3Ds', {
      bucket: kbInvestmentResearchS3,
      knowledgeBase: investmentAnalystVecKB,
      chunkingStrategy: genai.bedrock.ChunkingStrategy.FIXED_SIZE,
      dataDeletionPolicy: genai.bedrock.DataDeletionPolicy.DELETE,
    });

    const powerToolsLayerVersion = "68";
    this.powerToolsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "PowertoolsLayer",
      lambdaArchitecture === lambda.Architecture.X86_64
        ? `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python312-x86_64:10`
        : `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python38-arm64:2`
    );

    const ingestionJobLambdaHandler = new lambdaPython.PythonFunction(this, "BedrockKbDsIngestionHandler", {
      entry: path.join(__dirname, "../functions/bedrock-kb-ingestion-handler/"),
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambdaArchitecture,
      timeout: cdk.Duration.minutes(5),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      layers: [this.powerToolsLayer],
      environment: {
        KB_ID: investmentAnalystVecKB.knowledgeBaseId,
        DS_ID: investmentAnalystKBS3Ds.dataSourceId,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeAgent",
            "bedrock:InvokeModel",
            "bedrock:InvokeModelWithResponseStream",
            "bedrock:Retrieve",
            "bedrock:RetrieveAndRead",
            "bedrock:CreateDataSourceFromS3",
            "bedrock:StartIngestionJob",
            "bedrock:GetIngestionJob",
            "bedrock:ListIngestionJob"
          ],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["xray:PutTelemetryRecords", "xray:PutTraceSegments"],
          resources: ["*"]
        }),
      ],
    });

    const ingestionJobLambdaHandlerTrigger = new cr.AwsCustomResource(this, 'IngestionJobLambdaHandlerTrigger', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ingestionJobLambdaHandler.functionName,
          InvocationType: 'Event',
        },
        physicalResourceId: cr.PhysicalResourceId.of('IngestionJobLambdaHandlerTrigger'),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: ingestionJobLambdaHandler.functionName,
          InvocationType: 'Event',
        },
        physicalResourceId: cr.PhysicalResourceId.of('IngestionJobLambdaHandlerTrigger'),
      },
      timeout: cdk.Duration.minutes(5),
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [ingestionJobLambdaHandler.functionArn],
        }),
      ]),
    });

    ingestionJobLambdaHandlerTrigger.node.addDependency(ingestionJobLambdaHandler);
    ingestionJobLambdaHandler.node.addDependency(investmentAnalystKBS3Ds);

    const newsSentimentHandler = new lambdaPython.PythonFunction(this, "NewsSentimentHandler", {
      entry: path.join(__dirname, "../functions/news-sentiment-handler"),
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambdaArchitecture,
      timeout: cdk.Duration.minutes(10),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      layers: [this.powerToolsLayer],
      environment: {
        API_KEY: ALPHA_VANTAGE_APIKEY || "<<api_key>>",
        NEWS_TOPICS: "earnings",
        NEWS_LIMIT: "3"
      },
    });

    const agentInstructions = `Provide the latest news and sentiment analysis for {ticker} and output in JSON Format as per schema below. Include the entire response from the API.
  
   Example JSON Format:
    {
        "news": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string",
                "description": "Title of the article"
              },
              "summary": {
                "type": "string",
                "description": "Brief summary of the article"
              },
              "source": {
                "type": "string",
                "description": "Source of the article"
              },
              "url": {
                "type": "string",
                "description": "URL of the article"
              },
              "ticker_sentiment_score": {
                "type": "number",
                "description": "Sentiment score of the article related to the ticker"
              },
              "ticker_sentiment_label": {
                "type": "string",
                "description": "Sentiment label of the article related to the ticker"
              }
            }
          }
        },
        "summary": {
          "type": "string",
          "description": "A brief one-line or two-line overall summary of all the news items."
        }
      }
`

    const agentNewsSentimentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });

    agentNewsSentimentRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Retrieve",
        "bedrock:RetrieveAndGenerate",
        "bedrock:InvokeAgent",
        "bedrock:AssociateThirdPartyKnowledgeBase",
        "lambda:InvokeFunction",
        "sts:AssumeRole",
        "bedrock:GetInferenceProfile",
        "bedrock:ListInferenceProfiles",
      ],
      resources: ["*"]
    }));

    const cris = genai.bedrock.CrossRegionInferenceProfile.fromConfig({
      geoRegion: genai.bedrock.CrossRegionInferenceProfileRegion.US,
      model: genai.bedrock.BedrockFoundationModel.AMAZON_NOVA_MICRO_V1,
    });

    const agentNewsSentiment = new genai.bedrock.Agent(this, 'AgentNewsSentiment', {
      foundationModel: cris,
      instruction: agentInstructions,
      forceDelete: true,
      shouldPrepareAgent: true,
    });

    const agentNewsSentimentActionGroup = new genai.bedrock.AgentActionGroup({
      name: "AgentNewsSentimentActionGroup",
      executor: genai.bedrock.ActionGroupExecutor.fromlambdaFunction(newsSentimentHandler),
      enabled: true,
      functionSchema: {
        functions: [{
          name: 'market_data',
          description: 'provides market data for ticker',
          parameters: {
            ticker: {
              type: 'string',
              description: 'stock ticker example amzn',
              required: true,
            },
          },
        }],
      },
    });

    agentNewsSentiment.addActionGroup(agentNewsSentimentActionGroup);

    const guardrails = new genai.bedrock.Guardrail(this, 'bedrockGuardrails', {
      name: 'investmentAnalyst-BedrockGuardrails',
      description: 'Legal ethical guardrails.',
    });

    guardrails.addPIIFilter({
      type: genai.bedrock.PIIType.General.ADDRESS,
      action: genai.bedrock.GuardrailAction.ANONYMIZE,
    });

    guardrails.addDeniedTopicFilter(genai.bedrock.Topic.MEDICAL_ADVICE);
    guardrails.addDeniedTopicFilter(genai.bedrock.Topic.POLITICAL_ADVICE);
    guardrails.addDeniedTopicFilter(genai.bedrock.Topic.INAPPROPRIATE_CONTENT);
    guardrails.addDeniedTopicFilter(genai.bedrock.Topic.LEGAL_ADVICE);

    guardrails.addDeniedTopicFilter(
      genai.bedrock.Topic.custom({
        name: 'Legal_Advice_Custom',
        definition:
          'Offering guidance or suggestions on investment recommendations, legal matters, legal actions, interpretation of laws, or legal rights and responsibilities.',
        examples: [
          'Can you recommend buy or sell recommendations',
          'What are my legal rights in this situation?',
          'Is this action against the law?',
          'Can you explain this law to me?',
          'Can you recommend stocks to me?'
        ],
      }));

    NagSuppressions.addResourceSuppressions (kbInvestmentResearchS3, [
      { id: 'AwsSolutions-S1', reason: 'Only used for staging Investment Research Documents for KB.' },
    ]);      
      

    this.investmentAnalystKBKnowledgeBaseId = investmentAnalystVecKB.knowledgeBaseId;
    this.gentNewsSentimentAttrAgentId = agentNewsSentiment.agentId;
    this.agentAliasNewsSentimentAttrAgentAliasId = agentNewsSentiment.testAlias.aliasId;
    this.bedrockGuardrailsId = guardrails.guardrailId;
    this.bedrockGuardrailsVersion = guardrails.guardrailVersion;

    new cdk.CfnOutput(this, "kbInvestmentResearchS3", {
      value: kbInvestmentResearchS3.bucketName,
    });
  }
}
