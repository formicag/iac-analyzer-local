# E-commerce platform infrastructure
# Subtle issues across all 6 WAFR pillars

provider "aws" {
  region = "eu-west-1"
}

# --- Networking ---
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "ecommerce-vpc" }
}

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "eu-west-1a"
  tags              = { Name = "public-a" }
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "eu-west-1b"
  tags              = { Name = "public-b" }
}

# Subtle: No private subnets - DB and app in public subnets
resource "aws_subnet" "app_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.10.0/24"
  availability_zone       = "eu-west-1a"
  map_public_ip_on_launch = true  # Subtle: app servers get public IPs
  tags                    = { Name = "app-a" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

# --- Security Groups ---
resource "aws_security_group" "alb" {
  name_prefix = "alb-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Subtle: HTTP not redirected to HTTPS
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "app" {
  name_prefix = "app-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Subtle: overly broad egress - allows data exfiltration
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name_prefix = "db-sg-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Subtle: DB has internet egress - unnecessary for a database
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Load Balancer ---
resource "aws_lb" "main" {
  name               = "ecommerce-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  # Subtle: no access logs configured
  # Subtle: no deletion protection
}

resource "aws_lb_target_group" "app" {
  name     = "ecommerce-tg"
  port     = 8080
  protocol = "HTTP"  # Subtle: HTTP between ALB and app (not HTTPS)
  vpc_id   = aws_vpc.main.id

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10  # Subtle: too tolerant - slow failure detection
    timeout             = 30
    interval            = 60  # Subtle: infrequent health checks
  }
}

# --- Auto Scaling ---
resource "aws_launch_template" "app" {
  name_prefix   = "ecommerce-"
  image_id      = "ami-0c55b159cbfafe1f0"
  instance_type = "m5.xlarge"  # Subtle: possibly over-provisioned

  network_interfaces {
    associate_public_ip_address = true  # Subtle: app servers exposed
    security_groups             = [aws_security_group.app.id]
  }

  # Subtle: no IMDSv2 enforcement
  # metadata_options not configured - defaults to IMDSv1

  # Subtle: no instance profile / IAM role
  # Applications can't use AWS SDK properly without roles

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "ecommerce-app"
    }
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "ecommerce-asg"
  desired_capacity    = 2
  max_size            = 2   # Subtle: max = desired, cannot scale up
  min_size            = 2   # Subtle: min = max, no scaling flexibility
  target_group_arns   = [aws_lb_target_group.app.arn]
  vpc_zone_identifier = [aws_subnet.app_a.id]  # Subtle: single AZ only

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # Subtle: no scaling policies defined
  # Subtle: no instance refresh strategy
}

# --- Database ---
resource "aws_db_instance" "main" {
  identifier        = "ecommerce-db"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = "db.r5.large"
  allocated_storage = 100

  db_name  = "ecommerce"
  username = "admin"
  password = var.db_password

  # Subtle: single AZ, no Multi-AZ
  multi_az = false

  # Subtle: no encryption at rest
  storage_encrypted = false

  # Subtle: publicly accessible
  publicly_accessible = true

  # Subtle: short backup retention
  backup_retention_period = 1

  # Subtle: no performance insights
  performance_insights_enabled = false

  # Subtle: deletion protection off
  deletion_protection = false

  skip_final_snapshot = true  # Subtle: data loss risk

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.id
}

resource "aws_db_subnet_group" "main" {
  name       = "ecommerce-db-subnet"
  subnet_ids = [aws_subnet.public_a.id, aws_subnet.public_b.id]  # Subtle: using public subnets for DB
}

# --- S3 ---
resource "aws_s3_bucket" "assets" {
  bucket = "ecommerce-static-assets-prod"
  # Subtle: no versioning
  # Subtle: no lifecycle rules
  # Subtle: no server-side encryption configured
  # Subtle: no access logging
}

resource "aws_s3_bucket" "logs" {
  bucket = "ecommerce-application-logs"
  # Subtle: log bucket itself has no lifecycle policy - unbounded growth
}

# --- ElastiCache ---
resource "aws_elasticache_cluster" "sessions" {
  cluster_id           = "ecommerce-sessions"
  engine               = "redis"
  node_type            = "cache.t3.medium"
  num_cache_nodes      = 1  # Subtle: single node, no replication
  port                 = 6379

  # Subtle: no encryption in transit
  # Subtle: no auth token
  # Subtle: no subnet group (defaults to default VPC)
  # Subtle: no automatic failover
}

# --- CloudWatch ---
# Subtle: No CloudWatch alarms defined at all
# No monitoring for CPU, memory, disk, error rates
# No SNS topic for notifications

# --- Variables ---
variable "db_password" {
  type      = string
  sensitive = true
}

# --- Outputs ---
output "alb_dns" {
  value = aws_lb.main.dns_name
}

output "db_endpoint" {
  value = aws_db_instance.main.endpoint
  # Subtle: exposing DB endpoint in outputs
}
