import { useGame } from './state/store.ts';
import { MainMenu } from './ui/MainMenu.tsx';
import { GameView } from './ui/GameView.tsx';

export default function App() {
  const screen = useGame((s) => s.screen);
  return screen === 'game' ? <GameView /> : <MainMenu />;
}
