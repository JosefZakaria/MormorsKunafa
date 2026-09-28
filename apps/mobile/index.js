import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Keep the app root literal so Metro can enumerate routes in this monorepo.
export function App() {
  const context = require.context('./app');
  return <ExpoRoot context={context} />;
}

registerRootComponent(App);
