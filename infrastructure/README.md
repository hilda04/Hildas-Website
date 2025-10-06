# Serverless infrastructure for the portfolio admin

This folder contains an AWS SAM template that provisions everything required to manage portfolio items (projects) from the new admin dashboard:

* **Amazon API Gateway** – exposes REST endpoints for CRUD operations and presigned S3 uploads.
* **AWS Lambda (Node.js 18)** – business logic that stores portfolio entries in DynamoDB and issues signed upload URLs.
* **Amazon DynamoDB** – persists portfolio item metadata (title, summary, link, tags, image key, timestamps).
* **Amazon S3** – stores uploaded project images with CORS enabled for direct browser uploads.

## Prerequisites

1. [Install the AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) and ensure Docker is available if you plan to run local tests.
2. Configure AWS credentials (`aws configure`) with permissions to deploy CloudFormation stacks, create Lambda functions, API Gateway stages, DynamoDB tables, and S3 buckets.
3. Clone this repository locally.

## Deploying

You can deploy the stack in two commands. From the project root:

```bash
sam validate --template-file infrastructure/template.yaml
sam deploy \
  --template-file infrastructure/template.yaml \
  --stack-name hilda-portfolio-stack \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    ProjectName=hilda-portfolio \
    AdminApiKey=YOUR_STRONG_SHARED_SECRET \
    AllowedOrigins="https://your-site.example,https://admin.your-site.example"
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `ProjectName` | Prefix added to named resources. Helps keep things grouped. |
| `AdminApiKey` | Shared secret required in the `x-admin-key` header for any create/update/delete/upload requests. Leave blank only if you plan to protect the API another way. |
| `AllowedOrigins` | Comma-separated list of origins allowed to call the API and upload directly to S3. Include both your public site and the admin dashboard origin. Use `*` only for testing. |

After a successful deployment SAM prints outputs similar to:

```
Outputs
-------------------------------------------------------------------------------------
Key                 ApiEndpoint                Value
ApiEndpoint         https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod
ItemsTableName      hilda-portfolio-stack-PortfolioTable-...
MediaBucketName     hilda-portfolio-stack-mediabucket-...
MediaBucketUrl      https://hilda-portfolio-stack-mediabucket-....s3.us-east-1.amazonaws.com
-------------------------------------------------------------------------------------
```

Copy the `ApiEndpoint` and `MediaBucketUrl` values for the front-end configuration.

## Connecting the front end

1. Host the static site (e.g., S3 + CloudFront, Amplify, Vercel, Netlify, etc.).
2. Before serving `admin.html`, inject a small configuration block **above** the `<script src="admin.js">` tag:

   ```html
   <script>
     window.PORTFOLIO_API_BASE = 'https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod';
     window.PORTFOLIO_MEDIA_BASE = 'https://hilda-portfolio-stack-mediabucket-123456.s3.us-east-1.amazonaws.com';
     window.PORTFOLIO_ADMIN_KEY = 'YOUR_STRONG_SHARED_SECRET';
   </script>
   ```

   For production, prefer serving the admin dashboard behind an authenticated channel (e.g., VPN, SSO portal, AWS Cognito). Avoid committing the admin key in version control.

3. For the public `index.html`, you can optionally inject the first two lines (API base and media base) before the closing `</body>` tag if you want to pull dynamic projects instead of the static fallback.

4. Open `admin.html`, click **Refresh**, and start creating projects. Uploaded images land in the S3 bucket provisioned by the template and are referenced automatically on the public site.

## Regenerating the stack

To update infrastructure changes:

```bash
sam build --template-file infrastructure/template.yaml
sam deploy --guided
```

To remove everything when finished:

```bash
sam delete --stack-name hilda-portfolio-stack
```

This deletes the Lambda function, API Gateway stage, DynamoDB table, and S3 bucket (after you empty it or confirm force deletion).
