# RoadMap Dashboard — Azure Deployment Runbook

## Overview

| Service | Type | Ingress | Port |
|---------|------|---------|------|
| `ca-roadmap-gateway` | Node/Express | **External** | 3000 |
| `ca-roadmap-frontend` | nginx (Vite PWA) | **External** | 80 |
| `ca-roadmap-auth` | Node/Express | Internal | 3001 |
| `ca-roadmap-metrics` | Python/FastAPI | Internal | 8000 |
| `ca-roadmap-export` | Python/FastAPI | Internal | 8001 |

All services run in the same **Azure Container Apps Environment** (`cae-roadmap-prod`).
Internal services are reachable only from within the environment — not from the internet.
All secrets are stored in **Azure Key Vault** and referenced via managed identity — no secret values appear in manifests or code.

---

## Prerequisites

```bash
az extension add --name containerapp
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

---

## Step 1 — Create Resource Group and Managed Identity

```bash
export RESOURCE_GROUP=rg-roadmap-prod
export LOCATION=eastus
export MANAGED_IDENTITY=id-roadmap-prod
export ACR_NAME=acrroadmapprod          # must be globally unique
export KEYVAULT_NAME=kv-roadmap-prod    # must be globally unique

az group create --name $RESOURCE_GROUP --location $LOCATION

az identity create \
  --name $MANAGED_IDENTITY \
  --resource-group $RESOURCE_GROUP

export MANAGED_IDENTITY_ID=$(az identity show \
  --name $MANAGED_IDENTITY \
  --resource-group $RESOURCE_GROUP \
  --query id --output tsv)

export MANAGED_IDENTITY_PRINCIPAL=$(az identity show \
  --name $MANAGED_IDENTITY \
  --resource-group $RESOURCE_GROUP \
  --query principalId --output tsv)
```

---

## Step 2 — Create Azure Container Registry

```bash
az acr create \
  --name $ACR_NAME \
  --resource-group $RESOURCE_GROUP \
  --sku Basic \
  --admin-enabled false

# Grant managed identity AcrPull role
az role assignment create \
  --assignee $MANAGED_IDENTITY_PRINCIPAL \
  --role AcrPull \
  --scope $(az acr show --name $ACR_NAME --query id --output tsv)
```

---

## Step 3 — Build and Push Docker Images

Replace `<placeholder>` values in each Dockerfile if needed, then:

```bash
export IMAGE_TAG=1.0.0

# Build and push all images
for service in gateway auth metrics export frontend; do
  case $service in
    gateway)  context=gateway       ;;
    auth)     context=services/auth ;;
    metrics)  context=services/metrics ;;
    export)   context=services/export  ;;
    frontend) context=frontend      ;;
  esac

  az acr build \
    --registry $ACR_NAME \
    --image roadmap/$service:$IMAGE_TAG \
    --file $context/Dockerfile \
    $context
done
```

> **Note**: The `frontend` build requires the `deploy/nginx/` directory at the repo root because
> the Dockerfile references `deploy/nginx/default.conf`. Build context must be the repo root:
> ```bash
> az acr build --registry $ACR_NAME --image roadmap/frontend:$IMAGE_TAG \
>   --file frontend/Dockerfile .
> ```

---

## Step 4 — Deploy Key Vault and Set Secrets

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file deploy/azure/keyvault.bicep \
  --parameters vaultName=$KEYVAULT_NAME \
               managedIdentityPrincipalId=$MANAGED_IDENTITY_PRINCIPAL

export KV_URI=https://$KEYVAULT_NAME.vault.azure.net

# Set secrets — values must be provided securely (never in scripts committed to git)
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name jwt-secret          --value "$(read -sp 'JWT secret: ' v; echo $v)"
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name auth-database-url   --value "postgresql+pg://..."
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name metrics-database-url --value "postgresql+psycopg://..."
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name logging-database-url --value "postgresql+psycopg://..."
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name admin-email         --value "admin@yourdomain.com"
az keyvault secret set --vault-name $KEYVAULT_NAME \
  --name admin-password      --value "$(read -sp 'Admin password: ' v; echo $v)"
```

---

## Step 5 — Create Container Apps Environment

Update `deploy/azure/container-app-env.yaml` with your Log Analytics workspace details, then:

```bash
az containerapp env create \
  --name cae-roadmap-prod \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

---

## Step 6 — Deploy Container Apps

Before deploying each YAML manifest, replace all `<placeholder>` values:

```bash
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
ACA_ENV_DOMAIN=$(az containerapp env show \
  --name cae-roadmap-prod \
  --resource-group $RESOURCE_GROUP \
  --query properties.defaultDomain --output tsv)

# Replace placeholders with sed (Linux/macOS) or use envsubst
for f in deploy/azure/*.yaml; do
  sed -i \
    -e "s|<subscription-id>|$SUBSCRIPTION_ID|g" \
    -e "s|<resource-group>|$RESOURCE_GROUP|g" \
    -e "s|<acr-name>|$ACR_NAME|g" \
    -e "s|<keyvault-name>|$KEYVAULT_NAME|g" \
    -e "s|<aca-env-default-domain>|$ACA_ENV_DOMAIN|g" \
    -e "s|id-roadmap-prod|$MANAGED_IDENTITY_ID|g" \
    "$f"
done

# Deploy internal services first
az containerapp create --yaml deploy/azure/auth.yaml    --resource-group $RESOURCE_GROUP
az containerapp create --yaml deploy/azure/metrics.yaml --resource-group $RESOURCE_GROUP
az containerapp create --yaml deploy/azure/export.yaml  --resource-group $RESOURCE_GROUP

# Deploy gateway after internals are healthy
az containerapp create --yaml deploy/azure/gateway.yaml   --resource-group $RESOURCE_GROUP
az containerapp create --yaml deploy/azure/frontend.yaml  --resource-group $RESOURCE_GROUP
```

---

## Step 7 — Verify Health

```bash
GATEWAY_URL=$(az containerapp show \
  --name ca-roadmap-gateway \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn --output tsv)

FRONTEND_URL=$(az containerapp show \
  --name ca-roadmap-frontend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn --output tsv)

curl https://$GATEWAY_URL/health    # {"status":"ok","service":"gateway"}
curl https://$FRONTEND_URL/         # 200 HTML
```

---

## Updating Images (Zero-Downtime Revision)

```bash
az containerapp update \
  --name ca-roadmap-gateway \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_NAME.azurecr.io/roadmap/gateway:1.1.0
```

Azure Container Apps creates a new revision and shifts traffic automatically (single-revision mode replaces previous).

---

## Secret Rotation

Rotate a secret in Key Vault, then trigger a new revision to pick it up:

```bash
az keyvault secret set --vault-name $KEYVAULT_NAME --name jwt-secret --value "<new-value>"

# Force new revision to reload secrets
az containerapp revision restart \
  --name ca-roadmap-gateway \
  --resource-group $RESOURCE_GROUP \
  --revision $(az containerapp revision list \
    --name ca-roadmap-gateway \
    --resource-group $RESOURCE_GROUP \
    --query "[0].name" --output tsv)
```

---

## Manifest Placeholder Reference

| Placeholder | Description |
|-------------|-------------|
| `<subscription-id>` | Azure subscription ID |
| `<resource-group>` | Resource group name (`rg-roadmap-prod`) |
| `<acr-name>` | Azure Container Registry name (`acrroadmapprod`) |
| `<keyvault-name>` | Key Vault name (`kv-roadmap-prod`) |
| `<aca-env-default-domain>` | Container Apps environment default domain |
| `id-roadmap-prod` | Managed identity resource ID |
| `<log-analytics-workspace-id>` | Log Analytics workspace customer ID |
| `<log-analytics-workspace-key>` | Log Analytics workspace shared key |
