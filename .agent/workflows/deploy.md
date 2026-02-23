---
description: Deploy the latest built image to Cloud Run via gcloud
---

// turbo-all

1. Deploy the latest image to Cloud Run:

```bash
gcloud run deploy lumen-pipeline \
  --image=us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest \
  --project=lumen-pipeline \
  --region=us-east4
```

2. Verify the service is healthy:

```bash
SERVICE_URL=$(gcloud run services describe lumen-pipeline --project=lumen-pipeline --region=us-east4 --format='value(status.url)')
curl -s "$SERVICE_URL/health" | python3 -m json.tool
```
