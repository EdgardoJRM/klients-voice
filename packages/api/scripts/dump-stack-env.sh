#!/usr/bin/env bash
# Imprime en consola variables sugeridas para .env (API) y NEXT_PUBLIC_* (dashboard).
# Uso:  ./scripts/dump-stack-env.sh [REGION] [STACK_NAME]
# Ej.:  ./scripts/dump-stack-env.sh us-east-1 klients-voice
# No escribe archivos; solo stdout para que copies y pegues.

set -euo pipefail
REGION="${1:-us-east-1}"
STACK="${2:-klients-voice}"

echo "========== Identidad =========="
aws sts get-caller-identity
echo ""

echo "========== ¿Existe el stack '$STACK' en $REGION? =========="
if ! aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" &>/dev/null; then
  echo "ERROR: Stack no encontrado. Despliega primero: cd packages/api && sam build && sam deploy"
  echo ""
  echo "Stacks recientes con 'klients' en el nombre (para localizar otro nombre):"
  aws cloudformation list-stacks --region "$REGION" \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query "StackSummaries[?contains(StackName, 'klients') || contains(StackName, 'Klients')].StackName" \
    --output text | tr '\t' '\n' || true
  exit 1
fi

echo "========== Outputs CloudFormation =========="
aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table
echo ""

echo "========== Tablas DynamoDB (Logical → Physical) =========="
aws cloudformation list-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResourceSummaries[?ResourceType=='AWS::DynamoDB::Table'].[LogicalResourceId,PhysicalResourceId]" \
  --output table
echo ""

API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" --output text)
[[ -z "$API_URL" || "$API_URL" == "None" ]] && API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text || true)
POOL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" --output text)
CLIENT=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolClientId'].OutputValue" --output text)
[[ -z "$CLIENT" || "$CLIENT" == "None" ]] && CLIENT=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoClientId'].OutputValue" --output text || true)
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AssetsBucketName'].OutputValue" --output text)
[[ -z "$BUCKET" || "$BUCKET" == "None" ]] && BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" --output text || true)

echo "========== COPIA DESDE AQUÍ — packages/api/.env (o Lambda env mirror) =========="
echo "AWS_REGION=$REGION"

while IFS=$'\t' read -r LOGICAL PHYS; do
  [[ -z "${PHYS:-}" ]] && continue
  case "$LOGICAL" in
    TenantsTable) echo "TABLE_TENANTS=$PHYS" ;;
    UsersTable) echo "TABLE_USERS=$PHYS" ;;
    EventsTable) echo "TABLE_EVENTS=$PHYS" ;;
    ParticipantsTable) echo "TABLE_PARTICIPANTS=$PHYS" ;;
    CallLogsTable) echo "TABLE_CALL_LOGS=$PHYS" ;;
    IntegrationsTable) echo "TABLE_INTEGRATIONS=$PHYS" ;;
    PhoneNumbersTable) echo "TABLE_PHONE_NUMBERS=$PHYS" ;;
    AgentsTable) echo "TABLE_AGENTS=$PHYS" ;;
    MaterialsTable) echo "TABLE_MATERIALS=$PHYS" ;;
    MaterialAccessTable) echo "TABLE_MATERIAL_ACCESS=$PHYS" ;;
    PrintJobsTable) echo "TABLE_PRINT_JOBS=$PHYS" ;;
    PrinterStationsTable) echo "TABLE_PRINTER_STATIONS=$PHYS" ;;
    LabelTemplatesTable) echo "TABLE_LABEL_TEMPLATES=$PHYS" ;;
    EmailLogsTable) echo "TABLE_EMAIL_LOGS=$PHYS" ;;
  esac
done < <(aws cloudformation list-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResourceSummaries[?ResourceType=='AWS::DynamoDB::Table'].[LogicalResourceId,PhysicalResourceId]" --output text)

echo "S3_BUCKET_ASSETS=$BUCKET"
if [[ -n "$POOL" && "$POOL" != "None" ]]; then
  echo "COGNITO_ISSUER=https://cognito-idp.${REGION}.amazonaws.com/${POOL}"
fi
if [[ -n "$CLIENT" && "$CLIENT" != "None" ]]; then
  echo "COGNITO_AUDIENCE=$CLIENT"
fi
RETRY=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='RetryQueueUrl'].OutputValue" --output text 2>/dev/null || true)
[[ -n "$RETRY" && "$RETRY" != "None" ]] && echo "SQS_RETRY_QUEUE_URL=$RETRY"

echo ""
echo "# SES: verifica identidad en consola SES; no está en outputs del template por defecto"
echo "# SES_FROM_EMAIL="
echo "# Webhooks (genera valores y configúralos en prod):"
echo "# CLICKFUNNELS_WEBHOOK_SECRET="
echo "# ELEVENLABS_WEBHOOK_SECRET="
echo ""
echo "========== COPIA DESDE AQUÍ — packages/dashboard/.env.local / Vercel =========="
echo "NEXT_PUBLIC_API_URL=$API_URL"
echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=$POOL"
echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=$CLIENT"
echo "NEXT_PUBLIC_AWS_REGION=$REGION"
echo "NEXT_PUBLIC_KV_TENANT_ID=<tu-tenant-uuid>"

echo ""
echo "(Fin)"
