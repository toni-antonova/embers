---
description: Build and push the Lumen server Docker image via Cloud Build
---

// turbo-all

1. Run the Cloud Build command from the repo root:

```bash
cd /Users/antoniaantonova/Documents/projects/dots && gcloud builds submit \
  --config infrastructure/cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) \
  --project=lumen-pipeline --region=us-east4 \
  .
```

2. Wait for the build to complete. It should take ~1-2 min if only app code changed, or ~15-20 min if dependencies (pyproject.toml/uv.lock) changed.

3. Confirm the image was pushed by checking the output for "SUCCESS".
