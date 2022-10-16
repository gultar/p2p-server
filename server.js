import Receiver from './src/Receiver.js'
import { createServer } from 'http';
import IP from 'ip'

const run = (PORT) =>{
  const server = createServer()
  const host = IP.address()

  const node = new Receiver({
    httpServer:server,
    host:host,
    port:PORT | 3333,
    channel:'blockchain',
    cors:{origin:'*'}
  })
  node.start()
  node.discovery.startPeerDiscovery()
}

export default run