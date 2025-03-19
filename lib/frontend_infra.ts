import * as cognitoIdentityPool from "@aws-cdk/aws-cognito-identitypool-alpha";
import * as lambdaPython from "@aws-cdk/aws-lambda-python-alpha";
import * as cdk from "aws-cdk-lib";
import { RemovalPolicy, aws_wafv2 as wafv2 } from 'aws-cdk-lib';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import { NagSuppressions } from "cdk-nag";
import {
  ExecSyncOptionsWithBufferEncoding,
  execSync,
} from "node:child_process";
import * as path from "node:path";
import { Utils } from "./utils";

const lambdaArchitecture = lambda.Architecture.X86_64;

export interface FrontEndStackProps extends cdk.StackProps {
  investmentAnalystKBKnowledgeBaseId: string;
  gentNewsSentimentAttrAgentId: string;
  agentAliasNewsSentimentAttrAgentAliasId: string;
  powerToolsLayer: lambda.ILayerVersion;
  bedrockGuardrailsId: string;
  bedrockGuardrailsVersion: string;
}

export class FrontEndStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: FrontEndStackProps) {
    super(scope, id, props);
    const appPath = path.join(__dirname, "../user-interface");
    const buildPath = path.join(appPath, "dist");

    const ALPHA_VANTAGE_APIKEY = this.node.tryGetContext('ALPHA_API_KEY');

    const accessLogsBucket = new s3.Bucket(this, 'FrontEndAccessLogsBucket', {
      bucketName: 'fe-access-logs-bucket',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      enforceSSL: true,
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'logs',
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      selfSignUpEnabled: false,
      autoVerify: { email: true, phone: true },
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(3),
      },
    });

    const userPoolClient = userPool.addClient("UserPoolClient", {
      generateSecret: false,
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
    });

    const identityPool = new cognitoIdentityPool.IdentityPool(
      this,
      "IdentityPool",
      {
        authenticationProviders: {
          userPools: [
            new cognitoIdentityPool.UserPoolAuthenticationProvider({
              userPool,
              userPoolClient,
            }),
          ],
        },
      }
    );

    const originAccessIdentity = new cf.OriginAccessIdentity(this, "S3OAI");
    websiteBucket.grantRead(originAccessIdentity);

    const xOriginVerifySecret = new secretsmanager.Secret(
      this,
      "X-Origin-Verify-Secret",
      {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        generateSecretString: {
          excludePunctuation: true,
          generateStringKey: "headerValue",
          secretStringTemplate: "{}",
        },
      },
    );

    const secretRotationLambda = new lambda.Function(this, "SecretRotationLambda", {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambdaArchitecture,
      code: lambda.Code.fromAsset(path.join(__dirname, "../functions/secret-rotation-handler/")),
      handler: "index.lambda_handler",
      environment: {
        X_ORIGIN_VERIFY_SECRET_ARN: xOriginVerifySecret.secretArn,
      },
    }) ;

    xOriginVerifySecret.addRotationSchedule("RotationSchedule", {
      rotationLambda: secretRotationLambda,
      automaticallyAfter: cdk.Duration.days(1),
    });

    const itemsTable = new dynamodb.Table(this, "ItemsTable", {
      partitionKey: {
        name: "itemId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiHandler = new lambdaPython.PythonFunction(this, "ApiHandler", {
      entry: path.join(__dirname, "../functions/api-handler"),
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambdaArchitecture,
      timeout: cdk.Duration.minutes(5),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      layers: [props.powerToolsLayer],
      environment: {
        X_ORIGIN_VERIFY_SECRET_ARN: xOriginVerifySecret.secretArn,
        ITEMS_TABLE_NAME: itemsTable.tableName,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [xOriginVerifySecret.secretArn],
        }),
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeAgent", "bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
          resources: ["*"],
        }),
        new iam.PolicyStatement({
          actions: ["xray:PutTelemetryRecords", "xray:PutTraceSegments"],
          resources: ["*"]
        }),
      ],
    });

    // apiHandler.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayDaemonWriteAccess"));

    xOriginVerifySecret.grantRead(apiHandler);
    itemsTable.grantReadWriteData(apiHandler);

    const logGroup = new logs.LogGroup(this, "RestApiGatewayAccessLogs");
    
    const restApi = new apigateway.RestApi(this, "RestApi", {
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      cloudWatchRole: true,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Amz-Security-Token",
        ],
        maxAge: cdk.Duration.minutes(10),
      },
      deploy: true,
      deployOptions: {
        stageName: "api",
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        tracingEnabled: true,
        metricsEnabled: true,
        throttlingRateLimit: 2500,
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.clf(),
      },
    });

    const requestValidator = new apigateway.RequestValidator(this, 'MyRequestValidator', {
      restApi: restApi,
      requestValidatorName: 'requestValidatorName',
      validateRequestBody: false,
      validateRequestParameters: false,
    });    

    const cognitoAuthorizer = new apigateway.CfnAuthorizer(
      this,
      "ApiGatewayCognitoAuthorizer",
      {
        name: "CognitoAuthorizer",
        identitySource: "method.request.header.Authorization",
        providerArns: [userPool.userPoolArn],
        restApiId: restApi.restApiId,
        type: apigateway.AuthorizationType.COGNITO,
      }
    );

    const v1Resource = restApi.root.addResource("v1", {
      defaultMethodOptions: {
        authorizationType: apigateway.AuthorizationType.COGNITO,
        authorizer: { authorizerId: cognitoAuthorizer.ref },
        requestValidator: requestValidator
      },
    });

    const v1ProxyResource = v1Resource.addResource("{proxy+}");

    v1ProxyResource.addMethod(
      "ANY",
      new apigateway.LambdaIntegration(apiHandler, {
        proxy: true,
      }),
      {
        requestParameters: {
          "method.request.path.proxy": true,
        },
        requestValidator: requestValidator,
      }
    );

    const websocketAuthHandler = new lambdaNodeJs.NodejsFunction(this, "WebSocketAuthorizationHandler", {
      entry: path.join(__dirname, "../functions/websocket-auth-handler/index.ts"),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      timeout: cdk.Duration.minutes(5),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        APP_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    const webSocketsAuthTable = new dynamodb.Table(this, "WebSocketConnTbl", {
      partitionKey: {
        name: "connection_id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });


    const webSocketAuthorizer = new WebSocketLambdaAuthorizer('WebSocketLambdaAuthorizer', websocketAuthHandler, {
      identitySource: ['route.request.querystring.idToken'],
    });

    const chatHistoryTable = new dynamodb.Table(this, "ChatHistory", {
      partitionKey: {
        name: "SessionId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },      
    });

    const webSocketLambdaHandler = new lambda.DockerImageFunction(this, "WebSocketLambdaHandler", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "../functions/websocket-handler")),
      architecture: lambdaArchitecture,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_DAY,
      environment: {
        WEBSOCKET_TBL_NM: webSocketsAuthTable.tableName,
        CHAT_HISTORY_TBL_NM: chatHistoryTable.tableName,
        EMBEDDINGS_MODEL_ID: "amazon.titan-embed-text-v2:0",
        LLM_MODEL_ID: "us.amazon.nova-lite-v1:0", //"us.amazon.nova-pro-v1:0", //"amazon.nova-pro-v1:0", 
        ALPHA_VANTAGE_APIKEY: ALPHA_VANTAGE_APIKEY,
        KB_ID: props.investmentAnalystKBKnowledgeBaseId,
        AGENT_ID: props.gentNewsSentimentAttrAgentId,
        AGENT_ALIAS_ID: props.agentAliasNewsSentimentAttrAgentAliasId,
        BEDROCK_GUARDRAILSID: props.bedrockGuardrailsId,
        BEDROCK_GUARDRAILSVERSION: props.bedrockGuardrailsVersion
      }
    }) ;
    chatHistoryTable.grant(webSocketLambdaHandler, "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:UpdateItem");

    webSocketLambdaHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel",
          "bedrock:InvokeAgent",
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate",
          "bedrock:InvokeModelWithResponseStream",
          "bedrock:InvokeFlow",
          "bedrock:RenderPrompt",
          "bedrock:ApplyGuardrail",
          "apigateway:POST",
          "apigateway:GET",
          "apigateway:DELETE",
          "xray:PutTelemetryRecords",
          "xray:PutTraceSegments",
          "execute-api:ManageConnections",
          "execute-api:Invoke"
        ],
        resources: ["*"]
      }));

    webSocketsAuthTable.grant(webSocketLambdaHandler, "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:DeleteItem");

    const webSocketApiGateway = new apigatewayv2.WebSocketApi(this, 'WebSocketApiGateway', {
      connectRouteOptions: {
        authorizer: webSocketAuthorizer,
        integration: new WebSocketLambdaIntegration('ConnectWebSocketLmabdaHandler', webSocketLambdaHandler)
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectWebSocketLmabdaHandler', webSocketLambdaHandler)
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('DefaultWebSocketLmabdaHandler', webSocketLambdaHandler)
      },
    });

    const wsOriginRequestPolicy = new cf.OriginRequestPolicy(this, "webSocketPolicy", {
      originRequestPolicyName: "webSocketPolicy",
      comment: "A default WebSocket policy",
      cookieBehavior: cf.OriginRequestCookieBehavior.all(),
      headerBehavior: cf.OriginRequestHeaderBehavior.allowList("Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Protocol", "Sec-WebSocket-Accept"),
      queryStringBehavior: cf.OriginRequestQueryStringBehavior.allowList("idToken"),
    });

    const websocketStage = new apigatewayv2.WebSocketStage(this, 'WebsocketStage', {
      webSocketApi: webSocketApiGateway,
      stageName: 'wss',
      autoDeploy: true,

    });

    const cfLogsBucket = new s3.Bucket(this, "cfLogsBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      versioned: true
    });

    const cfLoggingConfiguration: cf.LoggingConfiguration = {
      bucket: cfLogsBucket,
      includeCookies: false,
      prefix: 'prefix',
    };

    cfLogsBucket.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [
        new iam.AnyPrincipal(),
      ],
      actions: [
        "s3:*"
      ],
      resources: [cfLogsBucket.bucketArn],
      conditions: {
        "Bool": { "aws:SecureTransport": "false" },
      },
    }));

    // Custom Cloudfront cache policy to forward Authorization header
    const cachePolicy = new cf.CachePolicy(this, 'CachePolicy', {
      headerBehavior: cf.CacheHeaderBehavior.allowList(
        'Authorization',
      ),
      cookieBehavior: cf.CacheCookieBehavior.none(),
      queryStringBehavior: cf.CacheQueryStringBehavior.none(),
      enableAcceptEncodingBrotli: true,
      enableAcceptEncodingGzip: true,
      minTtl: cdk.Duration.seconds(1),
      maxTtl: cdk.Duration.seconds(10),
      defaultTtl: cdk.Duration.seconds(5),
    });


    const invAnalystWebACL = new wafv2.CfnWebACL(this, "InvestmentAnalystWAcl", {
      defaultAction: {
        allow: {}
      },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'InvestmentAnalystWAcl',
        sampledRequestsEnabled: true
      },
      rules: [
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 0,
          overrideAction: {
            none: {}
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesCommonRuleSet'
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet'
            }
          }
        },
        {
          name: 'AWS-AWSManagedRulesKnownBadInputsRuleSet',
          priority: 1,
          overrideAction: {
            none: {}
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesKnownBadInputsRuleSet'
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet'
            }
          }
        },
        {
          name: 'AWS-AWSManagedRulesAmazonIpReputationList',
          priority: 2,
          overrideAction: {
            none: {}
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWS-AWSManagedRulesAmazonIpReputationList'
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList'
            }
          }
        }
      ]
    });

    const distribution = new cf.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        compress: true,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cf.AllowedMethods.ALLOW_ALL
      },
      defaultRootObject: "index.html",
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,
      additionalBehaviors: {
        "wss/*": {
          origin: new origins.HttpOrigin(`${webSocketApiGateway.apiId}.execute-api.${cdk.Aws.REGION}.amazonaws.com`),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: wsOriginRequestPolicy,
          compress: false
        },
        "api/*": {
          origin: new origins.HttpOrigin(`${restApi.restApiId}.execute-api.${cdk.Aws.REGION}.amazonaws.com`),
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cf.AllowedMethods.ALLOW_ALL,
          cachePolicy: cachePolicy,
          originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
        }
      },
      priceClass: cf.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cf.HttpVersion.HTTP2_AND_3,
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
      enableLogging: true,
      logBucket: cfLogsBucket,
      logFilePrefix: "distribution-access-logs",
      webAclId: invAnalystWebACL.attrArn,
    });

    const exportsAsset = s3deploy.Source.jsonData("aws-exports.json", {
      region: cdk.Aws.REGION,
      Auth: {
        Cognito: {
          userPoolClientId: userPoolClient.userPoolClientId,
          userPoolId: userPool.userPoolId,
          identityPoolId: identityPool.identityPoolId,
        },
      },
      API: {
        REST: {
          RestApi: {
            endpoint: `https://${distribution.distributionDomainName}/api/v1`,
          },
          WebSocketApi: {
            endpoint: `wss://${distribution.distributionDomainName}/wss/`
          },
        },
      },
    });

    const asset = s3deploy.Source.asset(appPath, {
      bundling: {
        image: cdk.DockerImage.fromRegistry(
          "public.ecr.aws/sam/build-nodejs18.x:latest"
        ),
        command: [
          "sh",
          "-c",
          [
            "npm --cache /tmp/.npm install",
            `npm --cache /tmp/.npm run build`,
            "cp -aur /asset-input/dist/* /asset-output/",
          ].join(" && "),
        ],
        local: {
          tryBundle(outputDir: string) {
            try {
              const options: ExecSyncOptionsWithBufferEncoding = {
                stdio: "inherit",
                env: {
                  ...process.env,
                },
              };

              execSync(`npm --silent --prefix "${appPath}" install`, options);
              execSync(`npm --silent --prefix "${appPath}" run build`, options);
              Utils.copyDirRecursive(buildPath, outputDir);
            } catch (e) {
              console.error(e);
              return false;
            }

            return true;
          },
        },
      },
      deployTime: true
    });

    const s3UserInterfaceDeployment = new s3deploy.BucketDeployment(this, "UserInterfaceDeployment", {
      prune: false,
      sources: [asset, exportsAsset],
      destinationBucket: websiteBucket,
      distribution,
    });

    NagSuppressions.addResourceSuppressions (cfLogsBucket, [
      { id: 'AwsSolutions-IAM5', reason: 'Denying permissions across all s3 actions.' },
    ]);

    NagSuppressions.addResourceSuppressions (cfLogsBucket, [
      { id: 'AwsSolutions-S1', reason: 'This is a logs buckets hence skipping access logging for this bucket.' },
    ]);

    NagSuppressions.addResourceSuppressions (accessLogsBucket, [
      { id: 'AwsSolutions-S1', reason: 'This is a logs buckets hence skipping access logging for this bucket.' },
    ]);

    NagSuppressions.addResourceSuppressions (webSocketLambdaHandler, [
      { id: 'AwsSolutions-L1', reason: 'Dependencies on libraries used.' },
    ]);    

    NagSuppressions.addResourceSuppressions (webSocketApiGateway, [
      { id: 'AwsSolutions-APIG4', reason: 'Disconnect cannot have authentication. Default route has lamba authorizer configured.' },
    ], true);

    NagSuppressions.addResourceSuppressions (userPool, [
      { id: 'AwsSolutions-COG3', reason: 'Cognito User Pool Advanced Security Mode is deprecated.' },
    ]);
    
    NagSuppressions.addResourceSuppressions (distribution, [
      { id: 'AwsSolutions-CFR4', reason: 'Application uses Websocket connections...' },
    ]);

    NagSuppressions.addResourceSuppressions (websocketStage, [
      { id: 'AwsSolutions-APIG1', reason: 'API Gateway Logging enabled.' },
    ], true);    

    NagSuppressions.addResourceSuppressions (restApi, [
      { id: 'AwsSolutions-APIG2', reason: 'Rest Api validations added across the resources.' },
    ], true);    

    // ###################################################
    // Outputs
    // ###################################################
    new cdk.CfnOutput(this, "CloudFront distribution URL:  ", {
      value: `https://${distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, "Cognito user pool id:  ", {
      value: userPool.userPoolId,
    });
  }
}