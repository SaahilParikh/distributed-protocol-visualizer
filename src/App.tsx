import { useState } from 'react';
import KademliaApp from './protocols/kademlia/KademliaApp';
import RaftApp from './protocols/raft/RaftApp';
import './App.css';

type Protocol = 'raft' | 'kademlia';

const PROTOCOLS: readonly { readonly id: Protocol; readonly label: string }[] = [
  { id: 'raft', label: 'Raft' },
  { id: 'kademlia', label: 'Kademlia (DHT)' },
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
      {protocol === 'raft' ? <RaftApp /> : <KademliaApp />}
    </div>
  );
}
