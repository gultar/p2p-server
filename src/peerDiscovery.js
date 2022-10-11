import isIP from 'is-ip';
import { EventEmitter } from 'events';
import Swarm from 'discovery-swarm';
import { randomBytes } from 'crypto';

class Contact{
    constructor({ host, port, address, lastSeen }){
        this.host = host;
        this.port = port;
        this.address = address
        this.lastSeen = lastSeen
    }
}

export default class PeerDiscovery{

    constructor({ channel, address, host, port, knownPeers, utp, tcp }){
        this.channel = channel;
        this.address = address;
        this.utp = utp | false;
        this.tcp = tcp | true;
        this.host = host;
        this.port = port;
        this.knownPeers = knownPeers || {}
        this.swarm;
        this.emitter = new EventEmitter()
        this.potentialPeers = {}
    }

    searchDHT(){
        console.log('Looking for peers on Bittorrent DHT')
            
        this.swarm = Swarm({
            id: randomBytes(32).toString('hex'), // peer-id for user
            utp: this.utp, // use utp for discovery
            tcp: this.tcp, // use tcp for discovery
            maxConnections: 10,
            
        })
        
        this.swarm.listen(this.port)
        this.swarm.on('connection', (connection, peer) => this.handleConnection(connection, peer))
        this.swarm.on('peer', (peer) => this.handlePeerMessage(peer))
        this.swarm.join(this.channel)
        return "Searching Bittorrent DHT for potential peers"
    }

    /**
     * Return an event emitter which will pass a message in case of new potential
     * peer connection. 
     * Exposes the emitter, basically.
     * @returns EventEmitter
     */
    waitForPeerMessage(){
        return this.emitter;
    }

    handleConnection(connection, peer){
        try{
            if(!peer.channel) return false;
            if(!connection) return false;

            let channel = peer.channel.toString()
            if(channel !== this.channel) return false;
            if(peer.host == 'localhost') return false;
            console.log('Handle:', peer)
            let nodePort = parseInt(peer.port) //To be changed and fixed to a port number
            let address = `http://${peer.host}:${nodePort}`;
            peer.address = address
            this.emitter.emit('peerDiscovered', peer)

            return peer;
        }catch(e){
            console.error(e)
        }
    }

    handlePeerMessage(peer){
        if(!peer.channel) return false;

        let channel = peer.channel.toString()
        if(channel !== this.channel) return false;

        let address = `${peer.host}:${peer.port}`
        this.potentialPeers[address] = {
            peer:peer, //DHT connection
            connected:false,  
            channel:channel
        }
        return true; //successfully added potential peer
    }

    cleanUpPeers(){
        let peerAddresses = Object.keys(this.knownPeers);
        peerAddresses.forEach( address=>{
            if(this.knownPeers[address]){
                if(this.knownPeers[address].lastSeen < Date.now - (24 * 60 * 1000)){
                    this.emitter.emit('peerInactive', this.knownPeers[address])
                    delete this.knownPeers[address]
                }

            }
        })
    }

    close(){
        this.swarm.destroy(()=>{
            this.emitter.removeAllListeners('peerDiscovered')
            logger('DHT Peer discovery stopped')
        })
    }
}

