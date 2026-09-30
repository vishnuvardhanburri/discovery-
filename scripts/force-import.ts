import { XaviraOperator } from '../src/server/XaviraOperator';
import * as path from 'path';

async function main() {
  const operator = new XaviraOperator({
    artifactsDir: path.join(process.cwd(), 'artifacts', 'intelligence'),
  });
  
  console.log('Starting import of dataset.csv...');
  await operator.cmdImport('dataset.csv');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
