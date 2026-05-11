# distributed-protocol-visualizer

An interactive Raft + Kademlia visualizer in the browser. Five nodes, deterministic seeded
simulation, live playback. Submit log entries, crank up the drop rate, watch
the cluster recover.

## Live

https://saahilparikh.github.io/distributed-protocol-visualizer/

## Local

```
npm install
npm run dev
```

## How it works

The simulator (`src/sim`) is a small event-driven engine: a virtual clock, a
seeded RNG, a priority queue of scheduled deliveries, and a `Network` that
delays or drops messages. Protocols (`src/protocols`) plug in through a narrow
`Protocol` interface. The UI (`src/ui`) drives the simulator each animation
frame and renders state from the recorded trace, so scrubbing and replay are
free.

Raft is implemented end to end for a single-term: leader election, log
replication, commit rules, and term handling. Paxos is next.

## License

MIT.
