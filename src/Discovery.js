import Swarm from 'discovery-swarm';
import { randomBytes } from 'crypto';
import EventEmitter from "events";
import { log, errlog } from './utils.js'
import { isIPv4 } from 'is-ip';
import { connect } from 'http2';
import { createHistogram } from 'perf_hooks';

class Discovery{
    constructor({ host, peerDiscoveryPort, channel }){

        this.host = host || "127.0.0.1";
        //To avoid problems, default DHT port is Socket port number minus one
        this.peerDiscoveryPort = peerDiscoveryPort;  
        this.nodePort = parseInt(peerDiscoveryPort + 1)
        this.channel = channel || "main";
        this.address = `http://${this.host}:${this.nodePort}`
        this.peersConnected = {}
        this.announcer = new EventEmitter();
        this.discoveredConnections = {}
    }


    //Start Peer Discovery through Bittorrent DHT
    startPeerDiscovery(){
        this.swarm = new Swarm({
            id: randomBytes(32).toString('hex'),
            utp: this.utp || false, // use utp for discovery
            tcp: this.tcp || true, // use tcp for discovery
            maxConnections: 10,
        })

        this.swarm.on('connection', (connection, peer) => this.handleConnection(connection, peer))
        this.swarm.on('drop', (peer)=> this.handleDroppedConnection(peer))
        this.swarm.on('connect-failed', (peer, details)=> this.handleConnectFailed(peer, details))
        this.swarm.on('handshaking', (connection, info) => this.handleHandshaking(connection, info))
        this.swarm.on('handshake-timeout', (connection, info) => this.handleHandshakeTimeout(connection, info))
        this.swarm.on('redundant-connection', (connection, info) => this.handleRedundantConnection(connection, info))
        this.swarm.on('peer', peer => this.handlePeer(peer))
        this.swarm.listen(this.peerDiscoveryPort)
        this.swarm.join(this.channel)

    }

    handleDroppedConnection(peer){
        errlog('Connection with peer dropped')
    }
    handleConnectFailed(peer, details){
        errlog('Connection with peer failed', details)
    }
    handleHandshakeTimeout(connection, info){
        errlog('Handshake timed out', info)
    }
    handleHandshaking(connection, info){
        errlog('Handshaking with peer', info)
    }
    handleRedundantConnection(connection, info){
        errlog('Redundant connection', info)
    }
    handlePeer(peer){
        errlog('Found new peer', peer.adress)
    }

    handleConnection(connection, peer){
        try{
            if(peer.initiator){
                const peerServerPort = parseInt(peer.port) + 1
                const handshake = {
                    host:peer.host,
                    port:peerServerPort,
                    address:`http://${peer.host}:${peerServerPort}`
                }
                this.announcer.emit('newPeer', handshake)
            }
        }catch(e){
            console.error(e)
        }
    }


    pause(){
        //When max number of peers reached, stop discovery
    }

    close(){
        if(this.swarm){
            this.swarm.leave(this.channel)
            this.swarm.destroy()
            delete this['swarm']
        }
    }



}

export default Discovery