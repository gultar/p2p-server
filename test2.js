import test from 'tape'
import express from 'express';
import { createServer } from "http";
import Receiver from './src/receiver.js';
import { argv } from "process";
import IP from 'ip'

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

const node1 = createNode(2000)
const node2 = createNode(1000)
node1.connect(node2.address)