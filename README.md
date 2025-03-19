# Guidance for Investment Analyst Assistant on AWS

This repository contains guidance for implementing Generative AI based Investment Analyst Assistant application using Amazon Bedrock and other AWS Services. The guidance will process and analyze financial statements, market data, and news data to produce comprehensive investment reports, helping analysts make informed decisions quicker.

## Table of Contents

1. [Overview](#overview)
    - [Cost](#cost)
2. [Prerequisites](#prerequisites)
    - [Operating System](#operating-system)
3. [Deployment Steps](#deployment-steps)
4. [Deployment Validation](#deployment-validation)
5. [Running the Guidance](#running-the-guidance)
6. [Next Steps](#next-steps)
7. [Cleanup](#cleanup)
8. [FAQ, known issues, additional considerations, and limitations](#faq-known-issues-additional-considerations-and-limitations)
9. [Revisions](#revisions)
10. [Notices](#notices)
11. [Authors](#authors)
 
## Overview

Almost all firms in the capital markets space perform some type of investment analyses – from sector analysis to individual stocks.

Some of these firms perform research on investment, and many actively manage investments for institutional or individual clients. Financial organizations generate, collect, and use data to gain insights into financial operations, make better decisions, and improve performance. However, there are challenges associated with multi-modal data due to the complexity and lack of standardization in financial systems and data formats and quality, as well as the fragmented and unstructured nature of the data.

By following this architecture, you can build a Generative AI based Investment Analyst Assistant application using Amazon Bedrock and other AWS Services. The guidance package will process and analyze financial statements, market data, and news data to produce comprehensive investment reports, helping analysts make informed decisions quicker.

Core Features:

- Summarize Stock Fundamentals data using Large Language Model(LLM).
- Query unstructured documents (10K, 10Q pdf) using Retrieval Augumented Generation and LLM.
- Analyze Stock News and Summarize Sentiments using LLM.

## Architecture Diagram

![Investment Analyst Architecture](assets/images/investment-analyst-arch.png)

## High-Level Overview and Flow

1. The Front End is a React App using `AWS Amplify` and is hosted on `Amazon Simple Storage Service (S3)` and served via `Amazon CloudFront` and `AWS Web Application Firewall (WAF)`. The App uses WebSockets to connect to the backend API's.

2. The user authenticates to the application via `Amazon Cognito` user pools. The application retrieves an API key, URL, and Amazon Cognito user pool ID from `AWS Secrets Manager`.

3. User provides stock ticker or stock name for performing fundamental income statement analysis. The Front End App uses a WebSocket Connection to send the ticker for response. The WebSocket Connection is established to the `AWS API Gateway` via `Amazon Cloudfront`. The `AWS API Gateway` is integrated with `AWS Lambda` to be the handler for all the WebSocket requests. 

4. This Lambda handles the connect, disconnect and message WebSocket requests. If its a connect request the Lambda stores the WebSocket connection metadata in an `AWS DynamoDB` table. This metadata information is used to respond back through the WebSocket to the respective user the response of the request sent upon completion of execution. This Lambda Application executes `LangChain Agent` which leverages available tools to retrieve ticker related income statement data from External Sources. Retrieved financial data and specific prompt are sent to `Amazon Bedrock Nova Pro` model to perform quantitative data analysis and obtain Financials summary. User can view summary data in chart, tabular and summary format in the application.

5. The `AWS API Gateway` is configured with an `AWS Lambda` as an Authorizer. This authorizer validates the JSON Web Token against `AWS Cognito` to ensure only authenticated users are able to make the requests.

6. `AWS DynamoDB` table holds the metadata information of the browser client requesting for data from the backend. When the WebSocket is disconnected records in this table are deleted by the WebSocket Handler Lambda function.

7. When the user provides stock ticker for analyzing stock sentiment based on stock related news. The WebSocket Lambda Handler invokes a Bedrock Agent which is configured to invoke an `AWS Lambda` function (News Sentiment Handler).

8. For further analysis using qualitative data, users can upload financials documents such as 10K/10Q pdf documents and perform further analysis example 10K/Q statement, investor reports etc retriever chain is executed to perform similarity search on data stored in Vector store and results sent along with prompt to Bedrock Amazon Nova Prod model. Bedrock LLM provides answers for queries along with citations.

9. Financials/Research documents such as 10K/10Q, investor analysis pdf documents are ingested into `Amazon Bedrock Knowledgebase`.`Amazon Bedrock Titan Embeddings Model` is used to convert text data into vectors.

10. Vector data is stored in `Amazon OpenSearch Serverless Vector Index`.

11. News Sentiment Handler `AWS Lambda` invokes live news data (via Alpha vantage API) and returns the same back to the Bedrock Agent which then summarizes the sentiment and responds back to the user.

12. `Amazon Nova Pro Model` hosted in `Amazon Bedrock` is used to provide analysis, summaries, answers on both structured and unstructured data that is provided for all the analysis indicated above. `Amazon Bedrock Guardrails` are leveraged within the guidance package to ensure the output from the LLM is sanitized to remove Legal Advice, Political Advice, Investment Advice and Inappropriate Content.

13. `AWS Cognito` is used to provide user authentication capabilities in this architecture. It could be used to provide user authorization functionalities as well. `AWS Web Application Firewall` provides the perimeter security in protecting the solution to control traffic and block common attack patterns such as SQL Injection or Cross-Site scripting (XSS). `AWS Secrets Manager` is used to securely maintain and retrieve secrets used within the application.

14. `AWS CloudWatch` is used for centralized logging and debugging of the application. `AWS CloudTrail` is used to log and monitoring all the API Traffic to the AWS services used in the application.

### Cost

Pricing for Bedrock involves charges for model inference and customization. Note that some token pricing for 3P models on Amazon Bedrock is not included in the cost calculator

Check out the [cost calculator](https://calculator.aws/#/estimate?id=758ab1bd6364356f2a41903cb1858e57f20b810c) for deploying this project.

*Note: For the most current and detailed pricing information for Amazon Bedrock, please refer to the [Amazon Bedrock Pricing Page](https://aws.amazon.com/bedrock/pricing/).*

_We recommend creating a [Budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) through [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) to help manage costs. Prices are subject to change. For full details, refer to the pricing webpage for each AWS service used in this Guidance._

### Sample Cost Table

The following table provides a sample cost breakdown for deploying this Guidance with the default parameters in the US East (N. Virginia) Region for one year.

| AWS Services Cost | Small Customer | Medium Customer | Large Customer |
|------------------|-----------------|-----------------|----------------|
| Vector Database Cost| $16,823.52| $105,163.20| $473,472.00 |
| Application Cost| $31,706.40| $284,724.96| $1,411,643.28 |
| Generative AI| $110,641.00| $1,106,412.00| $5,532,168.00 |
| Total| $159,170.92| $1,496,300.16| $7,417,283.28 |

**Calculations for Medium Customer**
| Region | Description | Service | Upfront | Monthly | First 12 months total | Configuration summary | 
| ------ | ----------- | ------- | ------- | ------- | --------------------- | --------------------- | 
| US East (Ohio)| Research Vector Index| Amazon OpenSearch Service| $0.00| $8,763.60| $105,163.20| How many Indexing OCUs? (20), How many Search and Query OCUs? (30), How big is the index data? (150 GB) |
| US East (Ohio)| Research Docs | S3 Standard| $0.00| $0.72| $8.64| S3 Standard storage (30 GB per month), PUT, COPY, POST, LIST requests to S3 Standard (3000), GET, SELECT, and all other requests from S3 Standard (30000) |
| US East (Ohio)| Research Docs | Data Transfer| $0.00| $0.00| $0.00| DT Inbound: Internet (5 GB per month), DT Outbound: Not selected (0 TB per month) |
| US East (Ohio)| Cognito User Pool| Amazon Cognito| $0.00| $109.25| $1,311.00| Optimization Rate for Token Requests (0), Optimization Rate for App Clients (0), Number of monthly active users (MAU) (2000) |
| US East (Ohio)| Web Socket Session Data| DynamoDB provisioned capacity| $180.00| $26.39| $496.68| Table class (Standard), Average item size (all attributes) (1 KB), Write reserved capacity term (1 year), Read reserved capacity term (1 year), Data storage size (1 GB) |
| US East (Ohio)| Web Socket Authorizer| AWS Lambda| $0.00| $0.00| $0.00| Invoke Mode (Buffered), Architecture (x86), Architecture (x86), Number of requests (20000 per day), Amount of ephemeral storage allocated (512 MB) |
| US East (Ohio)| Web Socket Handler| AWS Lambda| $0.00| $5.64| $67.68| Invoke Mode (Buffered), Architecture (x86), Architecture (x86), Number of requests (960000 per day), Amount of ephemeral storage allocated (512 MB) |
| US East (Ohio)| Cloudfront WAF| AWS Web Application Firewall (WAF)| $0.00| $8.60| $103.20| Number of Web Access Control Lists (Web ACLs) utilized (1 per month), Number of Managed Rule Groups per Web ACL (3 per month) |
| US East (Ohio)| API Gateway| Amazon API Gateway| $0.00| $23,561.48| $282,737.76| HTTP API requests units (millions), Average size of each request (34 KB), REST API request units (millions), Cache memory size (GB) (None), WebSocket message units (thousands), Average message size (32 KB), Messages (960000 per day), Average connection duration (45 seconds), Average connection rate (3 per second) |
| US East (Ohio)| Bedrock KB Ingestion & Query On-Demand| Amazon Bedrock| $12.00| $92,200.00| $1,106,412.00| One time 3000 docs with 1MB ingestion and small customer query using Amazon Nova Pro and Titan Embeddings V2 - Text |

## Prerequisites

### Operating System

The deployment used AWS Cloud Development Kit (CDK). The prerequisites outlined in the [CDK Prerequisities](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html) is recommended for deploying this Guidance Package asset.

### Third-party tools

Before deploying the guidance code, ensure that the following required tools have been installed:

- AWS Cloud Development Kit (CDK) >= 2.126.0
- Python >= 3.8
- Docker Desktop >= 27.4.0

### AWS account requirements

**Required resources:**

- [Bedrock Model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) for Amazon Nova Pro Model, and Amazon Titan embeddings Model
- [AWS S3](https://aws.amazon.com/pm/serv-s3)
- [Amazon VPC](https://aws.amazon.com/vpc/)
- [AWS Lambda](https://aws.amazon.com/lambda)
- [Amazon OpenSearch](https://aws.amazon.com/opensearch-service/)
- [AWS WAF](https://aws.amazon.com/waf/)
- [Amazon Cognito](https://aws.amazon.com/cognito/)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [AWS IAM role](https://aws.amazon.com/iam) with specific permissions
- [AWS CLI](https://aws.amazon.com/cli/)
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html)
- [Github](https://github.com)

### Requesting Access to AWS Bedrock

1. Log in to the AWS Management Console
2. Search for "Bedrock" in the search bar
3. Click "Get Started" on the Amazon Bedrock service page
4. Click "Manage Model Access" in the popup
5. Select "Amazon" from the list of available models
6. Click "Request Model Access" at the bottom of the page
7. Make sure to enable Model access for `Amazon Titan Embeddings G1 - Text`, & `Amazon Nova Pro` model.

### Supported Regions

The services used in the Guidance do not support all Regions, hence the guidance package is well suited to be deployed in `us-west-2` and `us-east-1` region.

### aws cdk bootstrap

This Guidance uses AWS CDK. If you are using aws-cdk for the first time, please see the [Bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) section of the AWS Cloud Development Kit (AWS CDK) v2 developer guide, to provision the required resources, before you can deploy AWS CDK apps into an AWS environment.

## Local Development Steps:
Verify that your environment satisfies the following prerequisites:
1. An [AWS account](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/)
2. `AdministratorAccess` policy granted to your AWS account (for production, we recommend restricting access as needed)
3. Both console and programmatic access
4. [NodeJS 20+](https://nodejs.org/en/download/) installed
    - If you are using [`nvm`](https://github.com/nvm-sh/nvm) you can run the following before proceeding
    - ```
      nvm install 20 && nvm use 20
      ```
5. [AWS CLI](https://aws.amazon.com/cli/) installed and configured to use with your AWS account
6. [Typescript 3.8+](https://www.typescriptlang.org/download) installed
7. [AWS CDK CLI](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) installed
8. [Docker](https://docs.docker.com/get-docker/) installed
   - N.B. [`buildx`](https://github.com/docker/buildx) is also required. For Windows and macOS `buildx` [is included](https://github.com/docker/buildx#windows-and-macos) in [Docker Desktop](https://docs.docker.com/desktop/)

### Get aws-exports.json from the backend
Before you can connect to the backend from the local machine, you should deploy the backend part and then download the ``aws-exports.json`` file with the configuration parameters from the website.
`` https://dxxxxxxxxxxxxx.cloudfront.net/aws-exports.json  ``

![sample](/assets/images/aws-exports.png "aws-exports.json")

### Run the App with backend access

1. Move into the user interface folder
`
cd user-interface
`
2. Install the project dependencies by running:
`
npm install
`
3. Save ``aws-exports.json`` file to `user-interface/public` folder in the location where this source code has been downloaded to.
4. To start the development server, run:
`
npm run dev
`

This command will start a local development server at ``http://localhost:3000`` (or a different port if 3000 is in use). The server will hot-reload if you make edits to any of the source files.

## Vite.js

[https://vitejs.dev/](https://vitejs.dev/)

Vite.js is a modern, fast front-end build tool that significantly improves the developer experience when building web applications.

4. This project is a Python Project. Switch to the Virtual Env using the below command:
   `
   python3 -m venv .venv
   `

5. After the init process completes and the virtualenv is created, you can use the following step to activate your virtualenv. Execute the following to activate the environment:
   `
   source .venv/bin/activate
   `

6. Install the required dependencies in the virtual environment. Please make sure you have installed aws cdk following the pre-requisites :
   `
   python3 -m pip install -r requirements.txt
   `

## Deployment Steps

1. On your computer/laptop that meets the [CDK Prerequisities](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html), use an appropriate Terminal and the run below command to download the asset to your computer/laptop.
   `
   git clone https://github.com/aws-solutions-library-samples/guidance-for-investment-analysis-using-amazon-bedrock.git
   `

2. Navigate into the `guidance-for-investment-analysis-using-amazon-bedrock` by running the following command in the terminal:
   `
   cd guidance-for-investment-analyst-assistant-on-aws
   `

3. Request an Alpha Vantage API Key by following the [Alpha Vantage API Documentation](https://www.alphavantage.co/)

4. Create a folder `invest-research-docs` and copy Company/Stock Research documents inside this folder.

5. Initialize CDK within the project using the command:
   `
   cdk init
   `

6. Bootstrap the CDK environment using the command :
   `
   cdk bootstrap
   `

7. Verify that the CDK deployment correctly synthesizes the CloudFormation template:
   `
   cdk synth
   `

8. From the terminal from within the `guidance-for-investment-analysis-using-amazon-bedrock` folder run the following command:
   `
   cdk deploy --context ALPHA_API_KEY=<<replace with code you registered in step #3>> InvestmentAnalystGPFrontEndStack
   `

Once you run the above command, it will take approximately *10 minutes* to deploy the entire stack. Note that as part of this stack creation, make a note of the outputs, in which you will find the `CloudFront distribution URL`, `Cognito user pool id`, and parameters for Bedrock Agents.

## Deployment Validation

- To verify a successful deployment of this guidance, open [CloudFormation](https://console.aws.amazon.com/cloudformation/home) console, and verify that the status of the stack named `InvestmentAnalystGPInfrStack` and `InvestmentAnalystGPFrontEndStack` is `CREATE_COMPLETE`.
- Once the project is deployed, AWS assets are created in your application. You can navigate to AWS CloudFormation console and click on aforementioned stack. Now you can click on `resources` tab which shows all the resources created by the stack.

## Running the Guidance

- Once cdk stack is deployed and assets are created, you can navigate setup the Amazon Knowledge Base and Amazon Bedrock Agents to leverage custom agent tool.

- **Front-End Configuration**
  - Now that the application has been deployed, you can login via the browser using Cloudfront URL or load balancer DNS URL. In case you face any issues:
    - Navigate to `CloudFront` from AWS console using search bar, click on `Distributions` and select the `CloudFront Distributions` created for you via CDK stack deployment.

- After opening the app in your browser, you will be presented with login page. In order to login, you need to create a user in Amazon Cognito. With a user pool, your users can sign in to your web or mobile app through Amazon Cognito.

- **Create a new user in Amazon Cognito**
  - Go to the [Amazon Cognito console](https://console.aws.amazon.com/cognito/home) . If prompted, enter your AWS credentials.
  - Navigate to user pools on the left side of the panel. You should see a user pool created via CDK stack.
  - Click on the pre-created user pool. You will land on the image shown below:
   ![Cognito](assets/images/cognito.png)
  - As shown in the image, you can click on `Users` tab below `Getting Started` section and click on `create user` to create your user profile.
  - Now, create a new user by providing username, valid email address and temporary password to login to the application.
  - After this setup, you should be able to login and launch your application!

- Once this setup is completed, you can select the `InvestmentAnalystStack.CloudFrontURL` value from your `Cloud9` output when you deployed the stack. After deployment, the output of the deployment in the terminal contains the link for running your application in your browser. Paste the link in your browser to launch the application. Feel free to play with the application. Cheers!

## Guidance Demo

- Now that all the configuration steps are completed, you should be able to open the Cloudfront URL as detailed above and start playing with the app:
![InvestmentAnalyst-ApplicationCloudFrontURL](assets/images/InvestmentAnalyst-ApplicationCloudFrontURL.png)

- Enter User ID and Password (setup in Amazon Cognito step) in order to login to the application.
![InvestmentAnalyst-Demo-1](assets/images/InvestmentAnalyst-Demo-1.png)
- Please read the application details from the left panel and execute different user scenarios.

## Next Steps

Here are some suggestions and recommendations on how customers can modify the parameters and components of the Investment analyst application to further enhance it according to their requirements:

1. **Customization of the User Interface (UI)**:
   - Customers can customize the frontend to match their branding and design requirements.
   - They can modify the layout, color scheme, and overall aesthetic of the application to provide a seamless and visually appealing experience for their users.
   - Customers can also integrate the application with their existing web or mobile platforms to provide a more cohesive user experience.

2. **Expansion of the Knowledge Base**:
   - Customers can expand the knowledge base by ingesting additional data sources, such as financial trends, and user preferences.
   - This can help improve the quality and relevance of the retrived information provided by the application.
   - Customers can also explore incorporating user feedback and interactions to continuously refine and update the knowledge base.

3. **Integration with External Data Sources**:
   - Customers can integrate the application with additional data sources and APIs.
   - This can enable more comprehensive and context-aware insights, taking into account factors like options trading insights, combined portfolio analysis in comparison to other portfolios.

4. **Multilingual and Localization Support**:
   - Customers can extend the application to support multiple languages, charts and cultural preferences, making it accessible to a broader user base.
   - This may involve translating the user interface, adapting the styling  to local ongoing market trends, and ensuring the application's content is relevant and appropriate for different regions and demographics.

5. **Changing the Bedrock Model**:
   - Customers can switch the model used in Bedrock by searching for "foundationModel" in the `/lib/genai_infra.ts` file.

## Cleanup

### Cleanup of CDK-Deployed Resources

1. **Terminate the CDK app**:
   - Navigate to the CDK app directory on your computer. In your case, it should be the same directory from where you ran the `cdk deploy` command.
   - Run the following command to destroy the CDK stack and all the resources it manages:```cdk destroy --all```
   - This will remove all the AWS resources created by the CDK app, including Lambda functions, DynamoDB tables, S3 buckets, and more.

2. **Verify resource deletion**:
   - Log in to the AWS Management Console and navigate to the relevant services to ensure all the resources have been successfully deleted.

### Manual Cleanup of Additional Resources

<TBC>

## FAQ, known issues, additional considerations, and limitations

- The provided code is intended as a demo and starting point, not production ready. 
- In this demo, Amazon Cognito is in a simple configuration. Note that Amazon Cognito user pools can be configured to enforce strong password policies,
enable multi-factor authentication, and set the AdvancedSecurityMode to ENFORCED to enable the system to detect and act upon malicious sign-in attempts.
- AWS provides various services, not implemented in this demo, that can improve the security of this application. Network security services like network ACLs and AWS WAF can control access to resources. You could also use AWS Shield for DDoS protection and Amazon GuardDuty for threats detection. Amazon Inspector performs security assessments. There are many more AWS services and best practices that can enhance security - refer to the AWS Shared Responsibility Model and security best practices guidance for additional recommendations. The developer is responsible for properly implementing and configuring these services to meet their specific security requirements.
- Regular rotation of secrets is recommended, that is not currently implemented in this package.

## Revisions

All notable changes to the version of this guidance package will be documented and shared accordingly.

Update 1:
- Changed to CloudScape/Amplify React Frontend deployed behind Amazon CloudFront and on AWS S3 buckets.
- Switching to Amazon Nova Pro Models in Amazon Bedrock
- Adding a generative AI chat feature
- Switching to Amazon OpenSearch Serverless for Vector Index
- End-to-End CDK deployment removing manual steps except for user addition in Amazon Cognito.

## Notices

Customers/Partners are responsible for making their own independent assessment of the information in this Guidance. This Guidance: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided “as is” without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.

## Acknowledgements

This code is inspired from:
- https://github.com/aws-samples/build-scale-generative-ai-applications-with-amazon-bedrock-workshop/
- https://github.com/aws-samples/websocket-chat-application

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This application is licensed under the MIT-0 License. See the LICENSE file.

## Authors
- Jay Pillai
- Chintan Sanghavi

## UI Design 
[https://cloudscape.design/](https://cloudscape.design/)

Cloudscape is an open source design system for the cloud. Cloudscape offers user interface guidelines, front-end components, design resources, and development tools for building intuitive, engaging, and inclusive user experiences at scale.
