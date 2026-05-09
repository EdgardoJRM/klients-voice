export type EnvConfig = {
  region: string;
  tableTenants: string;
  tableUsers: string;
  tableEvents: string;
  tableParticipants: string;
  tableCallLogs: string;
  tableIntegrations: string;
  tablePhoneNumbers: string;
  tableAgents: string;
  tableMaterials?: string;
  tableMaterialAccess?: string;
  tablePrintJobs?: string;
  tablePrinterStations?: string;
  tableLabelTemplates?: string;
  /** Email delivery logs (SES); optional for local dev without messaging */
  tableEmailLogs?: string;
  /** Private S3 bucket for QR PNGs, labels, materials (no public ACLs) */
  s3BucketAssets?: string;
  /** Verified SES identity (email or domain) used as From */
  sesFromEmail?: string;
  retryQueueUrl?: string;
  elevenLabsSecretArn?: string;
  twilioSecretArn?: string;
  clickfunnelsWebhookSecret?: string;
  elevenlabsWebhookSecret?: string;
  elevenLabsApiKey?: string;
  cognitoIssuer?: string;
  cognitoAudience?: string;
  defaultPhoneRegion?: string;
};

export function readEnv(): EnvConfig {
  const req = (key: string) => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var ${key}`);
    return v;
  };
  const opt = (key: string) => process.env[key];

  return {
    region: opt("AWS_REGION") ?? "us-east-1",
    tableTenants: req("TABLE_TENANTS"),
    tableUsers: req("TABLE_USERS"),
    tableEvents: req("TABLE_EVENTS"),
    tableParticipants: req("TABLE_PARTICIPANTS"),
    tableCallLogs: req("TABLE_CALL_LOGS"),
    tableIntegrations: req("TABLE_INTEGRATIONS"),
    tablePhoneNumbers: req("TABLE_PHONE_NUMBERS"),
    tableAgents: req("TABLE_AGENTS"),
    tableMaterials: opt("TABLE_MATERIALS"),
    tableMaterialAccess: opt("TABLE_MATERIAL_ACCESS"),
    tablePrintJobs: opt("TABLE_PRINT_JOBS"),
    tablePrinterStations: opt("TABLE_PRINTER_STATIONS"),
    tableLabelTemplates: opt("TABLE_LABEL_TEMPLATES"),
    tableEmailLogs: opt("TABLE_EMAIL_LOGS"),
    s3BucketAssets: opt("S3_BUCKET_ASSETS"),
    sesFromEmail: opt("SES_FROM_EMAIL"),
    retryQueueUrl: opt("SQS_RETRY_QUEUE_URL"),
    elevenLabsSecretArn: opt("SECRET_ELEVENLABS_ARN"),
    twilioSecretArn: opt("SECRET_TWILIO_ARN"),
    clickfunnelsWebhookSecret: opt("CLICKFUNNELS_WEBHOOK_SECRET"),
    elevenlabsWebhookSecret: opt("ELEVENLABS_WEBHOOK_SECRET"),
    elevenLabsApiKey: opt("ELEVENLABS_API_KEY"),
    cognitoIssuer: opt("COGNITO_ISSUER"),
    cognitoAudience: opt("COGNITO_AUDIENCE"),
    defaultPhoneRegion: opt("DEFAULT_PHONE_REGION") ?? "US",
  };
}
