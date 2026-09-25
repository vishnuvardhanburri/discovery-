/**
 * XAVIRA INTELLIGENCE OPERATOR — interactive terminal entry point.
 *
 * Run with:  npm run xavira
 */
import { XaviraOperator } from '../src/server/XaviraOperator';

async function main() {
  const operator = new XaviraOperator();
  await operator.start();
}

main().catch((err) => {
  console.error('XAVIRA OPERATOR FATAL:', err);
  process.exit(1);
});
