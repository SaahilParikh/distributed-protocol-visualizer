import { useState } from 'react';
import ChordApp from './protocols/chord/ChordApp';
import RaftApp from './protocols/raft/RaftApp';
import './App.css';

type Protocol = 'raft' | 'chord';

const PROTOCOLS: readonly { readonly id: Protocol; readonly label: string }[] = [
  { id: 'raft', label: 'Raft' },
  { id: 'chord', label: 'Chord (DHT)' },
];

export default function App() {
  const [protocol, setProtocol] = useState<Protocol>('raft');
  return (
    <div className="app">
      <header>
        <h1>Distributed protocol visualizer</h1>
        <div className="menu">
          {PROTOCOLS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`menu-tab${protocol === entry.id ? ' active' : ''}`}
              onClick={() => setProtocol(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>
      {protocol === 'raft' ? <RaftApp /> : <ChordApp />}
    </div>
  );
}
