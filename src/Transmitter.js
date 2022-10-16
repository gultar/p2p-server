import ioClient from 'socket.io-client';
import { argv } from "process";
import EventEmitter from 'events';
import PeerRegistry from './deprecated/PeerRegistry.js';
import { log, errlog, isEmpty } from './utils.js';
import IP from 'ip'
import sha1 from 'sha1'
//This is the outbound side of the node, where one connects to remote nodes

/**
 * This is the Socket.io-Client side of the P2P Node.
 * Its main function, obviously is to send events to nodes.
 * By design, it should not receive a lot of messages from servers
 */
class Transmitter{
    constructor({ host, port, address, announcer, maxConnections, timeout, networkMessages }){
        //For catching events about available peers to connect to
        this.host = host;
        this.port = port;
        this.address = address
        this.announcer = announcer || new EventEmitter()
        this.maxConnections = maxConnections || 10 //Max number of client connections to nodes
        this.timeout = timeout || 1000 * 30 //30 seconds
        this.connectionsToPeers = {}
        this.announcer.on('newPeer', handshake => this.connect(handshake))
        this.networkMessages = networkMessages
    }

    /**
     * Connects to remote node and opens up a couple of network listeners
     * @param {Object} handshake 
     * @returns 
     */
    connect(handshake){
        
        if(isEmpty(handshake)) throw Error('Handshake is empty');
        if(this.connectionsToPeers[handshake.address]) return 'Already exists'
        
        const address = handshake.address

        if(this.address == address) return 'Cannot connect to self'
        

        //Address added in query to enable peer server to find
        //This node's server also, and create a two-way connection
        const client = new ioClient(address, {
            query: {
                "connectionType":"transmitter",
                "address": this.address
            }
        })
        
        client.on('connect', () => this.handleNewConnection(client, address))
        client.on('peersShared', (peers)=> this.handlePeersShared(peers))
        client.on('message', (message)=> log(`|Client| ${message}`))
        client.on('disconnect', (peer)=> this.handleDisconnect(peer))

        return '|Client| Attempting connection to remote node. Standby...'
    }

    /**
     * Handles new outbound connections to remote nodes
     * stores them, and asks for peer's list of known peers
     * @param {Socket} client 
     * @param {string} address 
     */
    handleNewConnection(client, address){
        log(`|Client| Established connection to ${address}`)
        client.emit('sharePeers')
        this.connectionsToPeers[address] = client
    }

    /**
     * Receives an array of potential peers to connnect to
     * from remote node
     * @param {Array} peers 
     */
    handlePeersShared(peers){
        const slotsAvailable = this.maxConnections - Object.keys(this.connectionsToPeers).length
        if(peers.length <= slotsAvailable){
            // for(let address of peers){ this.connect({ address:address }) }
        }else{
            peers.splice(0, slotsAvailable)
            // for(let address of peers){ this.connect({ address:address }) }
        }
    }

    /**
     * Handles disconnection from remote peer server
     * @param {Socket} peer 
     */
    handleDisconnect(peer){
        log('|Client| Lost connection to remote peer', peer)
    }

    /**
     * Broadcasts a message to all peers this node is connected to
     * @param {string} message 
     * @returns Error message string or confirmation
     */
    broadcast(message){
        if(!message) return 'Message to be sent is empty'
        const messageID = sha1(Math.random())
        for(const address in this.connectionsToPeers){
            const client = this.connectionsToPeers[address]
            if(message.origin !== address){
                console.log('Broadcasting to', address)
                if(client) client.emit('networkMessage', {
                    data:message,
                    origin:this.address,
                    messageID:messageID,
                    relayedBy:this.address
                })
            }
        }

        return 'Okay'
    }

    /**
     * Serves to relay messages sent by other peers on the network
     * @param {Object} message
     */
    relay(message){
        for(const address in this.connectionsToPeers){
            const client = this.connectionsToPeers[address]
            if(message.origin !== address){
                if(message.relayedBy !== address){
                    console.log(`${this.address} relaying to ${address}`)
                    if(client) client.emit('networkMessage', {
                        data:message.data,
                        origin:message.origin,
                        messageID:message.messageID,
                        relayedBy:this.address
                    })
                }else{
                    //Same relay peer
                }
                
            }else{
                //Same origin peer
            }
            
        }
    }

    /**
     * Broadcasts a message to all peers this node is connected to, 
     * except a specified address
     * @param {Object} message 
     * @param {string} address 
     * @returns 
     */
    broadcastExcept(message, address){
        if(!message) return 'Message to be sent is empty'
        for(const address in this.connectionsToPeers){
            console.log(address )
            const client = this.connectionsToPeers[address]
            if(message.origin !== address){
                if(client) client.emit('networkMessage', {
                    message:message,
                    origin:this.address,
                    messageID:sha1(message)
                })
            }
        }

        return 'Okay'
    }

    /**
     * Sends a message to a specific peer server
     * @param {string} address 
     * @param {string} message 
     * @returns Error message string or confirmation
     */
    sendMessage(address, message){
        if(!this.connectionsToPeers[address]) return `No connection to peer ${address} found`

        const client = this.connectionsToPeers[address]
        client.emit('message', message)

        return 'Okay'
    }

    /**
     * Closes the connection to all peer servers
     */
    close(){
        Object.keys(this.connectionsToPeers).forEach((address)=>{
            const client = this.connectionsToPeers[address]
            client.close()
        })
    }
}

export default Transmitter