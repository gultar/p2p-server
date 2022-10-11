import test from 'tape'
import express from 'express';
import { createServer } from "http";
import Receiver from './src/receiver.js';
import { argv } from "process";
import IP from 'ip'

const delay = (fn, time=2000) =>{
  setTimeout(fn, time)
}

let node1;
let node2;
let node3;

const createNode = (port) =>{
  const httpServer = createServer()
  const host = IP.address();

  let node = new Receiver({
      httpServer:httpServer,
      channel:'blockchain',
      address:`http://${host}:${port}`,
      host:host,
      port:port
  })

  node.start()
  // node.discovery.startPeerDiscovery()
  return node
}

test('server is created successfully', (t)=>{
    const httpServer = createServer()
    const host = IP.address();
    const port = 1111
    let node = new Receiver({
        httpServer:httpServer,
        channel:'blockchain',
        address:`http://${host}:${port}`,
        host:host,
        port:port
    })

    node.start()
    delay(()=>{
      node.stop()
      node = {}
      t.ok(true, 'Server created successfully')
      t.end()
    })

})

test('server connects manually to another node', (t)=>{

  node1 = createNode(2222)
  node2 = createNode(3333)
  node1.transmitter.connect(node2)
  delay(()=>{
    if(node1.transmitter.connectionsToPeers[node2.address]){
      t.ok(true, 'Peers connected successfully')
      // delete node1.transmitter.connectionsToPeers[node2.address]
      node1.stop()
      node2.stop()

      delete node1.transmitter.connectionsToPeers[node2.address]
      delete node2.transmitter.connectionsToPeers[node1.address]

    }else{
      t.ok(false, 'Peer is not connected')
    }
    t.end()
  })
})

test('server connects to another node through discovery', (t)=>{
  node1 = createNode(4211)
  node2 = createNode(6311)
  node1.discovery.startPeerDiscovery()
  setTimeout(()=>{
    node2.discovery.startPeerDiscovery()
  }, 2000)
  delay(()=>{
    if(node1.hasPeer(node2.address)){
      t.ok(true, 'Peers connected successfully')
      node1.stop()
      node2.stop()
    }else{
      t.ok(false, 'Peer is not connected')
    }
    t.end()
  }, 5000)
})

test('server connects to another node through discovery', (t)=>{
  node1 = createNode(2222)
  node2 = createNode(3333)
  node1.discovery.startPeerDiscovery()
  node2.discovery.startPeerDiscovery()
  let isSuccess = false
  node2.on('test', (test)=>{
    console.log(test)
    isSuccess = true
  })
  if(node1.hasPeer(node2.address)){
    const clientConnection = node1.getPeer(node2.address)
    clientConnection.emit('test','test')
    delay(()=>{
      
      t.ok(isSuccess,`Message received: ${isSuccess}`)
    }, 2000)
    
  }else{
    t.ok(false, 'Peer is not connected')
  }
  delay(()=>{
    
    t.end()
  }, 5000)
})

