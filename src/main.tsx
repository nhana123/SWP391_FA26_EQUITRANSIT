import { captureTokenLink } from './shared/lib/token';
captureTokenLink();
// Loading the application after capture prevents token-bearing URLs from reaching UI modules.
void import('./app/bootstrap').then(({ mount }) => mount());
