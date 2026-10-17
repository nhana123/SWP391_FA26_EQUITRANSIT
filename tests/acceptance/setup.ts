import { openReadiness } from './environment';
export default async function setup() {
  await openReadiness(); // Also protects direct `playwright test --config ...` invocations.
}
