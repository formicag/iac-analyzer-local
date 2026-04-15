# Data analytics pipeline
# Tests Cost Optimization, Sustainability, and Operational Excellence pillars

provider "aws" {
  region = "us-east-1"
}

# --- Kinesis Data Stream ---
resource "aws_kinesis_stream" "events" {
  name             = "analytics-events"
  shard_count      = 20  # Subtle: massively over-provisioned for a startup
  retention_period = 168 # 7 days retention - costly

  # Subtle: no encryption
  # Subtle: no enhanced monitoring

  tags = { Environment = "production" }
}

# --- Lambda Functions ---
resource "aws_lambda_function" "processor" {
  function_name = "event-processor"
  runtime       = "python3.9"  # Subtle: outdated runtime (3.12 available)
  handler       = "handler.process"
  filename      = "processor.zip"
  role          = aws_iam_role.lambda_role.arn

  memory_size = 3008   # Subtle: max memory - probably wasteful
  timeout     = 900    # Subtle: 15 min timeout for a stream processor

  # Subtle: no reserved concurrency - could consume all account capacity
  # Subtle: no dead letter queue configured
  # Subtle: no X-Ray tracing enabled

  environment {
    variables = {
      BUCKET_NAME = aws_s3_bucket.data_lake.id
      LOG_LEVEL   = "DEBUG"  # Subtle: debug logging in production - costly
    }
  }
}

resource "aws_lambda_function" "aggregator" {
  function_name = "hourly-aggregator"
  runtime       = "python3.9"
  handler       = "handler.aggregate"
  filename      = "aggregator.zip"
  role          = aws_iam_role.lambda_role.arn

  memory_size = 1024
  timeout     = 300

  # Subtle: same role as processor - not least privilege
}

# --- IAM ---
resource "aws_iam_role" "lambda_role" {
  name = "analytics-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "analytics-lambda-policy"
  role = aws_iam_role.lambda_role.id

  # Subtle: wildcard permissions - not least privilege
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["kinesis:*"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:*"]
        Resource = "*"
      }
    ]
  })
}

# --- S3 Data Lake ---
resource "aws_s3_bucket" "data_lake" {
  bucket = "analytics-data-lake-prod"
}

# Subtle: no intelligent tiering or lifecycle rules
# Raw data stays in S3 Standard forever - costly for cold data

resource "aws_s3_bucket_versioning" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  versioning_configuration {
    status = "Enabled"  # Good practice, but...
  }
  # Subtle: versioning without lifecycle = unlimited version growth
}

# --- DynamoDB ---
resource "aws_dynamodb_table" "metrics" {
  name           = "analytics-metrics"
  billing_mode   = "PROVISIONED"
  read_capacity  = 100   # Subtle: fixed capacity, no auto-scaling
  write_capacity = 100   # Subtle: paying for peak 24/7

  hash_key  = "metric_id"
  range_key = "timestamp"

  attribute {
    name = "metric_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "N"
  }

  # Subtle: no TTL configured - table grows indefinitely
  # Subtle: no point-in-time recovery
  # Subtle: no auto-scaling policies
  # Subtle: no encryption with CMK (uses AWS-owned key)
}

# --- Glue ---
resource "aws_glue_job" "etl" {
  name     = "analytics-etl"
  role_arn = aws_iam_role.lambda_role.arn  # Subtle: reusing Lambda role for Glue

  command {
    name            = "glueetl"
    script_location = "s3://${aws_s3_bucket.data_lake.id}/scripts/etl.py"
    python_version  = "3"
  }

  # Subtle: G.2X workers are expensive
  number_of_workers = 10
  worker_type       = "G.2X"
  max_retries       = 3

  # Subtle: no job bookmarks - reprocesses all data each run
  # Subtle: no timeout set - could run indefinitely

  default_arguments = {
    "--enable-metrics"              = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--job-language"                = "python"
  }
}

# --- EventBridge ---
resource "aws_cloudwatch_event_rule" "etl_schedule" {
  name                = "etl-every-hour"
  schedule_expression = "rate(1 hour)"  # Subtle: hourly ETL might be excessive
}

# Subtle: No CloudWatch dashboards
# Subtle: No cost allocation tags on most resources
# Subtle: No budget alerts configured
# Subtle: Single region - no DR consideration
