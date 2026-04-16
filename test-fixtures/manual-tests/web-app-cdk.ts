import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

/**
 * Three-tier web application using ECS Fargate.
 * Has both good patterns and realistic gaps for WAFR review.
 */
export class WebAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- VPC ---
    const vpc = new ec2.Vpc(this, 'AppVpc', {
      maxAzs: 2,
      natGateways: 1, // Gap: only 1 NAT GW for cost, but single point of failure
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // Gap: No VPC flow logs enabled
    // vpc.addFlowLog('FlowLog', { destination: ec2.FlowLogDestination.toCloudWatchLogs() });

    // --- Database ---
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'Database security group',
      allowAllOutbound: false,
    });

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      multiAz: true,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      // Gap: credentials hardcoded instead of using Secrets Manager
      credentials: rds.Credentials.fromPassword('admin', cdk.SecretValue.plainText('Pr0duction_Pass!')),
      // Gap: No Performance Insights
      // Gap: No Enhanced Monitoring
    });

    // --- ECS Cluster ---
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true, // Good: insights enabled
    });

    // --- Fargate Service ---
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    const container = taskDef.addContainer('App', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'), // Gap: using :latest tag
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'webapp' }),
      environment: {
        DB_HOST: database.dbInstanceEndpointAddress,
        DB_PORT: database.dbInstanceEndpointPort,
        DB_NAME: 'webapp',
        DB_USER: 'admin',
        DB_PASS: 'Pr0duction_Pass!', // Gap: password in environment variable
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
    });

    container.addPortMappings({ containerPort: 80 });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true }, // Good: circuit breaker enabled
      // Gap: No auto-scaling configured
    });

    // Allow app to connect to database
    database.connections.allowFrom(service, ec2.Port.tcp(5432));

    // --- Load Balancer ---
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      deletionProtection: true,
      // Gap: No access logging
      // Gap: No WAF associated
    });

    // Gap: HTTP listener without HTTPS redirect
    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    listener.addTargets('AppTarget', {
      port: 80,
      targets: [service],
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
    });

    // --- S3 ---
    const bucket = new s3.Bucket(this, 'AssetsBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Good: public access blocked
      // Gap: No lifecycle rules
      // Gap: No access logging
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- Monitoring ---
    const cpuAlarm = new cloudwatch.Alarm(this, 'CpuAlarm', {
      metric: service.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
      // Gap: No alarm actions (no SNS topic)
    });

    // Gap: No dashboard
    // Gap: No 5xx alarm on ALB
    // Gap: No DB connection alarm

    // --- Outputs ---
    new cdk.CfnOutput(this, 'ALBEndpoint', {
      value: alb.loadBalancerDnsName,
      description: 'Application Load Balancer endpoint',
    });
  }
}

const app = new cdk.App();
new WebAppStack(app, 'WebAppStack', {
  env: { region: 'eu-west-2' },
});
