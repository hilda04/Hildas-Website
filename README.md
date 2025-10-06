# Hildas-Website
Github for my website serving my CV and stuff

## Admin dashboard & infrastructure

* `src/admin.html` + `src/admin.js` provide a dashboard to create, edit, and delete portfolio projects, including direct image uploads.
* `infrastructure/template.yaml` contains an AWS SAM stack (API Gateway, Lambda, DynamoDB, S3) that powers the admin dashboard. See `infrastructure/README.md` for deployment steps.
