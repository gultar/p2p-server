class PeerRegistry{
    constructor(){
        this.registry = {}
        this.pastPeers = {}
    }

    add(address, peer){
        if(this.alreadyExists(address)) return Error(`Peer ${address} already exists`)
        
        this.registry[address] = {
            address:address,
            peer:peer,
            connectTime:Date.now(),
            disconnectTime:false
        }
    }


    retrievePeer(address){
        if(!this.registry[address]) return Error(`Peer ${address} not found`)
        return 
    }

    disconnect(address){
        if(!this.alreadyExists(address)) return Error(`Peer ${address} is not connected`)
        const entry = this.registry[address]
        const peer = entry.peer
        this.pastPeers[address] = {
            address:address,
            connectTime:entry.connectTime,
            disconnectTime:Date.now()
        }
        if(peer.disconnect !== 'undefined') peer.disconnect() //In any case, makes sure the peer is disconnected
        
        delete this.registry[address]
    }

    erase(address){
        if(!address || typeof address !== 'string') {
            return Error('Peer Remove failed. Address passed is not a type string')
        }
        delete this.registry[address]
        delete this.pastPeers[address]
    }

    alreadyExists(address){
        return (this.registry[address] ? true : false)
    }
    
    connectedBefore(address){
        return (this.pastPeers[address] ? true : false)
    }

}

export default PeerRegistry