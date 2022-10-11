import express from 'express';
import { createServer } from "http";
import Receiver from './src/receiver.js';
import { argv } from "process";
import IP from 'ip'
//{ channel, address, host, port, knownPeers, utp, tcp }

const createNode = (port) =>{
    const httpServer = createServer()
    const host = IP.address();

    const node = new Receiver({
        httpServer:httpServer,
        channel:'blockchain',
        address:`http://${host}:${port}`,
        host:host,
        port:port,
        cors:{origin:"*"}
    })

    node.start()
    node.discovery.startPeerDiscovery()

    return node
}

const node1 = createNode(4444)
const node2 = createNode(3333)
const node3 = createNode(2222)
const node4 = createNode(1111)
const node5 = createNode(5555)
const node6 = createNode(6666)
setTimeout(()=>{
    node4.connect(node3.address)
    node3.connect(node2.address)
    node2.connect(node1.address)
    node5.connect(node4.address)
    node6.connect(node5.address)
    node1.connect(node6.address)
}, 2000)

setTimeout(()=>{
    // node1.transmitter.broadcast('test')
    // node1.sendNetworkMessage({ poubelle:'poubelles', config:"test" })
}, 10000)



