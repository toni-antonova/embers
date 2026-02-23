---
description: Full release — build Docker image, push, and deploy to Cloud Run
---

// turbo-all

1. Build and push the Docker image via Cloud Build:

```bash
cd /Users/antoniaantonova/Documents/projects/dots && gcloud builds submit \
  --config infrastructure/cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) \
  --project=lumen-pipeline --region=us-east4 \
  .
```

2. Wait for the build to complete and confirm "SUCCESS" in the output.

3. Deploy the new image to Cloud Run:

```bash
gcloud run deploy lumen-pipeline \
  --image=us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest \
  --project=lumen-pipeline \
  --region=us-east4
```

4. Verify the service is healthy:

```bash
SERVICE_URL=$(gcloud run services describe lumen-pipeline --project=lumen-pipeline --region=us-east4 --format='value(status.url)')
curl -s "$SERVICE_URL/health" | python3 -m json.tool
```
