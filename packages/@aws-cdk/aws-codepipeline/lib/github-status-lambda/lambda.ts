// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as aws from 'aws-sdk'; //relying on pacakges available in the lambda execution environment
import * as https from 'https';

const codepipeline = new aws.CodePipeline();
const secretsmanager = new aws.SecretsManager();

const secretName = process.env.SECRET_NAME as string;
const stage = process.env.STAGE as string;
if (!secretName && !stage) {
  throw new Error('Ensure Both SECRET_NAME and STAGE environment variables are set');
}

interface Event {
  version: string;
  id: string;
  detailType: string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    pipeline: string;
    'execution-id': string;
    stage: string;
    state: string;
    version: string;
  };
}

exports.handler = async (event: Event) => {
  console.log(event);
  const { region } = event;
  const pipelineName = event.detail.pipeline;
  const executionId = event.detail['execution-id'];
  const state = transformState(event.detail.state);

  if (state === null) {
    return null;
  }

  const result = await getPipelineExecution(pipelineName, executionId);
  const payload = createPayload(pipelineName, region, state);
  try {
    await postStatusToGitHub(result.owner, result.repository, result.sha, payload);
  } catch (error) {
    console.log(error);
    throw new Error(error);
  }
  //unsure why, but the status only changes after the second POST
  try {
    await postStatusToGitHub(result.owner, result.repository, result.sha, payload);
  } catch (error) {
    console.log(error);
    throw new Error(error);
  }
  return;
};

function transformState(state: string): string {
  if (state === 'STARTED') {
    return 'pending';
  }
  if (state === 'SUCCEEDED') {
    return 'success';
  }
  if (state === 'FAILED') {
    return 'failure';
  }
  throw new Error(`Unknown state: ${state}`);
}

interface Payload {
  state: string;
  target_url: string;
  description: string;
  context: string;
}

function createPayload(pipelineName: string, region: string, status: string): Payload {
  console.log('pipelineName:', pipelineName);
  console.log('status:', status);
  let description;
  if (status === 'started') {
    description = 'Build started';
  } else if (status === 'success') {
    description = 'Build succeeded';
  } else if (status === 'failure') {
    description = 'Build failed!';
  } else {
    description = 'Unknown description';
  }

  return {
    state: status,
    target_url: buildCodePipelineUrl(pipelineName, region),
    description: description,
    context: `${stage}`,
  };
}

function buildCodePipelineUrl(pipelineName: string, region: string) {
  return `https://${region}.console.aws.amazon.com/codepipeline/home?region=${region}#/view/${pipelineName}`;
}

const getPipelineExecution = async (pipelineName: string, pipelineExecutionId: string) => {
  const params = {
    pipelineName,
    pipelineExecutionId: pipelineExecutionId,
  };

  const result = await codepipeline.getPipelineExecution(params).promise();
  const artifactRevision = result.pipelineExecution.artifactRevisions[0];

  const revisionURL = artifactRevision.revisionUrl;
  const sha = artifactRevision.revisionId;

  const pattern = /github.com\/(.+)\/(.+)\/commit\//;
  const matches = pattern.exec(revisionURL) as RegExpExecArray;
  if (!matches) {
    throw new Error(`not matches for ${revisionURL} found`);
  }

  return {
    owner: matches[1],
    repository: matches[2],
    sha,
  };
};

interface SMResponse {
  ARN: string;
  CreatedDate: string;
  Name: string;
  SecretString: string;
  VersionId: string;
  VersionStages: [string];
}

function getSecret(secretId: string): Promise<SMResponse> {
  return new Promise((resolve, reject) => {
    secretsmanager.getSecretValue({ SecretId: secretId }, (err: Error, data: SMResponse) => {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(err); // an error occurred
      } else resolve(data);
    });
  });
}

const postStatusToGitHub = async (owner: string, repository: string, sha: string, payload: Payload) => {
  const hostname = 'api.github.com';
  const port = 443;
  const path = `/repos/${owner}/${repository}/statuses/${sha}`;

  const Password = await getSecret(secretName);

  const options = {
    hostname: hostname,
    port: port,
    path: path,
    method: 'POST',
    headers: {
      Authorization: `token ${Password.SecretString}`,
      'Content-Type': 'application/json',
      'User-Agent': 'github-status-reporter',
    },
  };

  const req = https.request(options, (res) => {
    console.log('statusCode:', res.statusCode);
    console.log('headers:', res.headers);

    res.on('data', (d) => {
      process.stdout.write(d);
    });
  });

  req.on('error', (e) => {
    console.error(e);
    throw new Error(e.toString());
  });
  console.log(JSON.stringify(payload));
  req.write(JSON.stringify(payload));
  req.end();
};

