# Three-tier web application
# Good example: has both correct patterns and real-world gaps

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "eu-west-2"
}

locals {
  project = "webapp"
  env     = "production"
  tags = {
    Project     = local.project
    Environment = local.env
    ManagedBy   = "terraform"
  }
}

# --- Networking ---

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(local.tags, { Name = "${local.project}-vpc" })
}

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "eu-west-2a"
  tags              = merge(local.tags, { Name = "${local.project}-public-a", Tier = "public" })
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "eu-west-2b"
  tags              = merge(local.tags, { Name = "${local.project}-public-b", Tier = "public" })
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "eu-west-2a"
  tags              = merge(local.tags, { Name = "${local.project}-private-a", Tier = "private" })
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "eu-west-2b"
  tags              = merge(local.tags, { Name = "${local.project}-private-b", Tier = "private" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.tags, { Name = "${local.project}-igw" })
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
  tags          = merge(local.tags, { Name = "${local.project}-nat" })
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${local.project}-nat-eip" })
}

# --- Security Groups ---

resource "aws_security_group" "alb" {
  name_prefix = "${local.project}-alb-"
  vpc_id      = aws_vpc.main.id
  tags        = merge(local.tags, { Name = "${local.project}-alb-sg" })

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Gap: HTTP still open, should redirect to HTTPS
  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
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

resource "aws_security_group" "app" {
  name_prefix = "${local.project}-app-"
  vpc_id      = aws_vpc.main.id
  tags        = merge(local.tags, { Name = "${local.project}-app-sg" })

  ingress {
    description     = "Traffic from ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name_prefix = "${local.project}-db-"
  vpc_id      = aws_vpc.main.id
  tags        = merge(local.tags, { Name = "${local.project}-db-sg" })

  ingress {
    description     = "MySQL from app tier"
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Load Balancer ---

resource "aws_lb" "main" {
  name               = "${local.project}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  enable_deletion_protection = true

  # Gap: No access logging configured
  tags = local.tags
}

resource "aws_lb_target_group" "app" {
  name     = "${local.project}-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/health"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
  }

  tags = local.tags
}

# --- Auto Scaling ---

resource "aws_launch_template" "app" {
  name_prefix   = "${local.project}-"
  image_id      = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"

  iam_instance_profile {
    name = aws_iam_instance_profile.app.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.app.id]
  }

  # Gap: No IMDSv2 enforcement
  # metadata_options {
  #   http_tokens = "required"
  # }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags          = merge(local.tags, { Name = "${local.project}-app" })
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "${local.project}-asg"
  desired_capacity    = 2
  min_size            = 2
  max_size            = 6
  target_group_arns   = [aws_lb_target_group.app.arn]
  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${local.project}-app"
    propagate_at_launch = true
  }

  # Gap: No scaling policies defined
}

# --- IAM ---

resource "aws_iam_role" "app" {
  name = "${local.project}-app-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
  tags = local.tags
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.project}-app-profile"
  role = aws_iam_role.app.name
}

# Gap: Role has no policies attached - app can't access any AWS services

# --- Database ---

resource "aws_db_instance" "main" {
  identifier        = "${local.project}-db"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = "db.t3.medium"
  allocated_storage = 50

  db_name  = "webapp"
  username = "admin"
  password = var.db_password

  multi_az            = true
  storage_encrypted   = true
  publicly_accessible = false

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.id

  backup_retention_period = 7
  deletion_protection     = true

  # Gap: No performance insights
  performance_insights_enabled = false

  # Gap: No enhanced monitoring
  # monitoring_interval = 60

  skip_final_snapshot = false
  final_snapshot_identifier = "${local.project}-db-final"

  tags = local.tags
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.project}-db-subnet"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  tags       = local.tags
}

# --- S3 ---

resource "aws_s3_bucket" "assets" {
  bucket = "${local.project}-static-assets"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Gap: No lifecycle rules - old versions accumulate forever
# Gap: No access logging on S3 bucket

# --- CloudWatch ---

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${local.project}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "CPU utilization above 80%"
  alarm_actions       = []  # Gap: No SNS topic for notifications
  tags                = local.tags
}

# Gap: No alarms for ALB 5xx, DB connections, disk space
# Gap: No CloudWatch dashboard

# --- Variables ---

variable "db_password" {
  type      = string
  sensitive = true
}

# --- Outputs ---

output "alb_dns" {
  value = aws_lb.main.dns_name
}
