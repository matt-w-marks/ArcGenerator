// Azure Key Vault — stores all secrets referenced by Container Apps manifests.
// Deploy with:
//   az deployment group create \
//     --resource-group $RESOURCE_GROUP \
//     --template-file deploy/azure/keyvault.bicep \
//     --parameters vaultName=<keyvault-name> managedIdentityPrincipalId=<id>
//
// After deploy, set secrets with:
//   az keyvault secret set --vault-name <vault> --name jwt-secret          --value <value>
//   az keyvault secret set --vault-name <vault> --name auth-database-url   --value <value>
//   az keyvault secret set --vault-name <vault> --name metrics-database-url --value <value>
//   az keyvault secret set --vault-name <vault> --name logging-database-url --value <value>
//   az keyvault secret set --vault-name <vault> --name admin-email          --value <value>
//   az keyvault secret set --vault-name <vault> --name admin-password       --value <value>
//
// NEVER commit actual secret values — set them via CLI only.

param vaultName string
param location string = resourceGroup().location
param managedIdentityPrincipalId string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true          // RBAC model — no access policies
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'         // Lock down to VNet in production
    networkAcls: {
      defaultAction: 'Allow'              // Restrict to specific IPs/VNets in production
      bypass: 'AzureServices'
    }
  }
}

// Grant the managed identity 'Key Vault Secrets User' role (read secrets only)
resource secretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentityPrincipalId, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'  // Key Vault Secrets User (built-in)
    )
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output keyVaultUri string = keyVault.properties.vaultUri
