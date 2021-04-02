//import * as s3 from '@aws-cdk/aws-s3';
import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import { App, Construct, Stack, StackProps, CfnOutput } from '../../lib';

interface extraProps extends StackProps {
  otherProp: string;
}

class StackOne extends Stack {
  toShare: string;
  constructor(scope: Construct, id: string, props?: extraProps) {
    super(scope, id, props);
    this.toShare = 'Some Cross Stack Value';
  }
}
class StackTwo extends Stack {
  valueFromStackOne: string;
  constructor(scope: Construct, id: string, props: extraProps) {
    super(scope, id, props);
    this.valueFromStackOne = props.otherProp;
  }
}

test('Cross stack references create Parameters', () => {
  const app = new App();
  // WHEN
  const stackOne = new StackOne(app, 'MyTestStackOne');
  const stackTwo = new StackTwo(app, 'MyTestStackTwo', { otherProp: stackOne.toShare});
  new CfnOutput(stackTwo, 'TestOutput', { value: stackTwo.valueFromStackOne });
  // THEN
  expectCDK(stackOne).to(haveResource('AWS::SSM::Parameter'));
});
