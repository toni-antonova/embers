---
description: Apply Terraform to deploy the latest image to Cloud Run
---

// turbo-all

1. Run terraform apply from the terraform directory:

```bash
cd /Users/antoniaantonova/Documents/projects/dots/infrastructure/terraform && terraform apply -auto-approve
```

2. Confirm the output shows the Cloud Run service URL.

3. Verify the service is healthy:

```bash
curl -s https://$(terraform output -raw service_url)/health | python3 -m json.tool
```
