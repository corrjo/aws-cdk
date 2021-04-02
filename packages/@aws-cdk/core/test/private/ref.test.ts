import { nodeunitShim, Test } from 'nodeunit-shim';
import { App, Construct, Stack, StackProps, CfnOutput } from '../../lib';
import { toCloudFormation } from '../util';

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
    new CfnOutput(this, 'TestOutput', { value: this.valueFromStackOne });
  }
}

nodeunitShim({
  crossStackRefCreatesParameter: {
    'Cross stack references create Parameters'(test: Test) {
      const app = new App();
      // WHEN
      const stackOne = new StackOne(app, 'MyTestStackOne');
      const stackTwo = new StackTwo(app, 'MyTestStackTwo', { otherProp: stackOne.toShare });
      new CfnOutput(stackTwo, 'TestOutput', { value: stackTwo.valueFromStackOne });
      const cfn = toCloudFormation(stackOne);
      test.deepEqual(cfn, { });
      test.done();
    },
  },
});
