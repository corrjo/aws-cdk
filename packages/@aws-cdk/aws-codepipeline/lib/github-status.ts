import * as lambda from "@aws-cdk/aws-lambda";
import * as cdk from "@aws-cdk/core";
import * as iam from "@aws-cdk/aws-iam";
import * as targets from "@aws-cdk/aws-events-targets";
import * as path from "path";
import * as cp from "./pipeline";
import { IStage } from "./action";

export interface GithubStatusProps {
  /**
   * The stage to report on
   * @default - None.
   */
  stage: IStage;

  /**
   * The name of a Secrets Manager secret with the GitHub oauth token
   * @default - None.
   */
  gitHubSecretName: string;
}

export class GithubStatus extends cdk.Construct {
  constructor(parent: cdk.Stack, name: string, props: GithubStatusProps) {
    super(parent, name);

    const statusLambda = new lambda.Function(this, "StatusLambda", {
      code: lambda.Code.asset(path.join(__dirname, "github-status-lambda")),
      handler: "lambda.handler",
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.NODEJS_10_X,
      environment: {
        SECRET_NAME: props.gitHubSecretName,
        STAGE: props.stage.stageName,
      },
    });

    const lambdaTarget = new targets.LambdaFunction(statusLambda);

    props.stage.onStateChange("StageOnStateChange", lambdaTarget, {
      eventPattern: {
        detailType: ["CodePipeline Pipeline Execution State Change"],
        source: ["aws.codepipeline"],
        detail: {
          state: ["STARTED", "SUCCEEDED", "FAILED"],
        },
      },
    });

    const statusLambdaPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AWSCodePipelineReadOnlyAccess"
    );

    statusLambda.role?.addManagedPolicy(statusLambdaPolicy);

    const inlinePolicy = new iam.Policy(this, "secret-access");

    inlinePolicy.addStatements(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        effect: iam.Effect.ALLOW,
        resources: [
          `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:secret:${props.gitHubSecretName}*`,
        ],
      })
    );
    statusLambda.role?.attachInlinePolicy(inlinePolicy);
  }
}
