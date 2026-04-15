# Microservices cluster on ECS
# Tests Reliability, Performance Efficiency, Operational Excellence

provider "aws" {
  region = "eu-west-2"
}

# --- VPC with proper layering ---
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "microservices-vpc" }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "eu-west-2a"
  tags              = { Name = "private-a" }
}

# Subtle: only 1 private subnet - single AZ for all services
# No private_b subnet in eu-west-2b

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "eu-west-2a"
  tags              = { Name = "public-a" }
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "eu-west-2b"
  tags              = { Name = "public-b" }
}

# --- ECS Cluster ---
resource "aws_ecs_cluster" "main" {
  name = "microservices"

  # Subtle: no container insights enabled
  # setting {
  #   name  = "containerInsights"
  #   value = "enabled"
  # }
}

# --- API Service ---
resource "aws_ecs_task_definition" "api" {
  family                   = "api-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "2048"   # Subtle: 2 vCPU might be over-provisioned
  memory                   = "4096"

  container_definitions = jsonencode([{
    name  = "api"
    image = "123456789.dkr.ecr.eu-west-2.amazonaws.com/api:latest"  # Subtle: using :latest tag

    portMappings = [{
      containerPort = 8080
      protocol      = "tcp"
    }]

    # Subtle: no health check defined in container
    # Subtle: no resource limits (CPU/memory) at container level
    # Subtle: no log configuration

    environment = [
      { name = "DB_HOST", value = "prod-db.cluster-xyz.eu-west-2.rds.amazonaws.com" },
      { name = "DB_USER", value = "api_user" },
      { name = "DB_PASS", value = "pr0d_p@ssw0rd!" },  # Subtle: password in env var, not Secrets Manager
      { name = "CACHE_URL", value = "redis://cache.internal:6379" },
    ]
  }])

  # Subtle: no task role - service can't access AWS resources securely
  # Subtle: no execution role for pulling ECR images (will fail)
}

resource "aws_ecs_service" "api" {
  name            = "api-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1  # Subtle: single instance - no redundancy
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [aws_subnet.private_a.id]  # Subtle: single subnet/AZ
    security_groups = [aws_security_group.ecs.id]
  }

  # Subtle: no deployment circuit breaker
  # Subtle: no service discovery
  # Subtle: no auto-scaling

  deployment_minimum_healthy_percent = 0    # Subtle: allows 0% healthy during deploy = downtime
  deployment_maximum_percent         = 100  # Subtle: no headroom for rolling deploy
}

# --- Worker Service ---
resource "aws_ecs_task_definition" "worker" {
  family                   = "worker-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "4096"   # Subtle: 4 vCPU worker
  memory                   = "8192"   # Subtle: 8GB memory

  container_definitions = jsonencode([{
    name  = "worker"
    image = "123456789.dkr.ecr.eu-west-2.amazonaws.com/worker:latest"

    # Subtle: no log driver configured
    environment = [
      { name = "QUEUE_URL", value = "https://sqs.eu-west-2.amazonaws.com/123/tasks" },
    ]
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "worker-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 3  # Subtle: fixed 3 workers, no auto-scaling based on queue depth
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = [aws_subnet.private_a.id]
    security_groups = [aws_security_group.ecs.id]
  }
}

# --- Security Groups ---
resource "aws_security_group" "ecs" {
  name_prefix = "ecs-sg-"
  vpc_id      = aws_vpc.main.id

  # Subtle: all ECS services share one SG - no service-level isolation
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]  # Subtle: entire VPC can reach any port
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- ALB ---
resource "aws_lb" "main" {
  name               = "microservices-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  enable_deletion_protection = false  # Subtle: no deletion protection

  # Subtle: no access logging
}

resource "aws_security_group" "alb" {
  name_prefix = "alb-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- SQS ---
resource "aws_sqs_queue" "tasks" {
  name                       = "microservices-tasks"
  visibility_timeout_seconds = 30
  message_retention_seconds  = 86400   # Subtle: only 1 day retention

  # Subtle: no DLQ configured - failed messages are lost
  # Subtle: no encryption
  # Subtle: no redrive policy
}

# Subtle: No CloudWatch alarms for:
#   - ECS CPU/memory
#   - ALB 5xx errors
#   - SQS queue depth
#   - Task failures
# Subtle: No X-Ray tracing
# Subtle: No WAF on ALB
# Subtle: No VPC flow logs
