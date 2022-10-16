import { Server } from "socket.io";
import EventEmitter from "events";
import { log, errlog } from './utils.js';
import Discovery from "./discovery.js";
import Transmitter from "./transmitter.js";
import {isIP} from 'is-ip'
import { io } from "socket.io-client";
// import UserEndpoint from './UserEndpoint.js'
import sha1 from 'sha1'

class Receiver extends Server{
    constructor({ httpServer, host, port, channel, ...opts }){
        super(httpServer, opts)
        this.host = host || "127.0.0.1";
        this.port = port || process.env.PORT; //Socket server port
        this.channel = channel || "main";
        this.address = `http://${this.host}:${this.port}`;
        this.peersConnected = {}
        this.userSockets = {}
        this.activeUsers = []
        this.usersOnline = {}
        const discoveryPort = parseInt(this.port) - 1
        this.discovery = new Discovery({
            host:host,
            peerDiscoveryPort:discoveryPort,
            channel:this.channel
        })
        this.announcer = this.discovery.announcer
        this.networkMessages = {}
        this.transmitter = new Transmitter({ 
            host:this.host,
            port:this.port,
            address:this.address,
            announcer:this.discovery.announcer,
            networkMessages: this.networkMessages
        })
        // this.endpoint = new UserEndpoint({
        //     transmitter:this.transmitter,
        //     address:this.address,
        //     peersConnected:this.peersConnected
        // })
        
    }

    hasPeer(address){
        return('connectedToPeer', (this.transmitter.connectionsToPeers[address] ? true:false))
    }

    getPeerNumber(){
        return('peerNumber', Object.keys(this.transmitter.connectionsToPeers).length)
    }

    getPeerAddresses(){
        return('peerAddresses', Object.keys(this.transmitter.connectionsToPeers))
    }

    //impossible to pass connection
    getPeer(address){
        return this.transmitter.connectionsToPeers[address]
    }

    connect(address){
        return this.transmitter.connect({ address:address })
    }

    /**
     * Starts up the node and opens up listeners
     * 
     */
    start(){
        log(`|Server| Node listening on port ${this.port}`)
        this.listen(this.port)
        
        this.on("connection", (socket) => {
            const handshake = socket.handshake
            const query = handshake.query
            const address = query.address
            
            if(query.connectionType == 'transmitter'){
                if(address !== this.address){
                    this.handleNewConnection(socket, address)
                    socket.on('sharePeers', ()=>{
                        const allPeers  = this.getPeerAddresses()
                        const requestingPeerAddress = socket.peerAddress
                        const peers = allPeers.filter(p => p !== requestingPeerAddress)
                        socket.emit('peersShared',peers)
                    })

                    socket.on('shareUsers', (message)=>{
                        message.isNewUser = true;
                    })

                    socket.on('networkMessage',  (message)=> this.handleNetworkMessage(message))
    
                    socket.on('disconnection', (peer)=>{
                        log('Peer connection dropped', peer)
                    })
                }

                
            }else{
                console.log(`${this.address} user connected ${socket.connected}`)
                this.newUser(socket)
            }
            
                
            socket.on('getPeerAddresses', ()=> {
                const addresses = this.getPeerAddresses()
                this.emit('peerAddresses', addresses)
            })


        });
    }

    newUser(socket){
        this.userSockets[socket.id] = socket
        socket.on('message', (message)=>{
            const userSocketIDs = Object.keys(this.userSockets)
            message.isUserMessage = true;
            for(let id of userSocketIDs){
                const user = this.userSockets[id]
                user.emit('messageResponse', message)
            }
            console.log(`${this.address} sending ${message.text}`)
            this.transmitter.broadcast(message)
            
        })
        socket.on('newUser', (user) => {
            //Adds the new user to the list of users
            this.usersOnline[user.userName] = user

            //Sends the list of users to the client
            const message = { ...user, isNewUser:true }
            //Announce new user over network
            this.transmitter.broadcast(message)
            //Push new list of active users on network to user endpoint who're connected to this node
            this.broadcastToUsers('usersOnline', this.usersOnline)
        });
        socket.on('disconnect', (disc, other) => {
            //Updates the list of users when a user disconnects from the server
            let userWhoDisconnected = {
                userName:'',
                socketID:''
            }
            
            //Try to find user who has disconnected through this socket's id
            for(let userName of Object.keys(this.usersOnline)){
                let user = this.usersOnline[userName]
                console.log('User', user)
                if(user.socketID === socket.id){
                    userWhoDisconnected = { 
                        userName:user.userName, 
                        socketID:user.socketID,
                        userDisconnected:true
                    }
                    console.log('FOUND IT', userWhoDisconnected)
                }
            }
            
            console.log('🔥: A user disconnected');
            delete this.usersOnline[userWhoDisconnected.userName]
            //Push new list of active users on network to user endpoint who're connected to this node
            this.broadcastToUsers('usersOnline', this.usersOnline)
            //Announce user disconnection over network
            this.transmitter.broadcast(userWhoDisconnected)
        });

        socket.on("connect_error", (err) => {
            console.log(`connect_error due to ${err.message}`);
        });
    }

    handleNewConnection(socket, address){
        //If peer node isn't already connected, add its connection
        if(!this.peersConnected[address]){
            this.peersConnected[address] = socket;
            //Store peerAddress for eventual use elsewhere
            socket.peerAddress = address;
            log(`|Server| Peer ${address} connected`)
            //Reciprocicate, by connecting to the node also
            this.transmitter.connect({ address:address })
            socket.on('message', message => this.receiveMessage(message))
        }
    }

    handleNetworkMessage(message){
        const messageID = message.messageID
        //if not already known, check message
        if(!this.networkMessages[messageID]){
            //Relays a new message to immediate peers
            //who will, in turn, relay it to other peers, and so on
            this.transmitter.relay(message)
            //save it to memory to avoid infinite loop
            this.networkMessages[messageID] = message
            //Decide what action to take according to message type
            this.handleNetworkMessageType(message)
        }else{
            //message already known
        }
    }

    handleNetworkMessageType(message){
        if(message.data.isUserMessage){
            //Is a general message, usually text
            //Data is an object in most cases
            
            const userMessage = message.data
            this.broadcastToUsers('messageResponse', userMessage, userMessage.socketID)
        }
        else if(message.data.isNewUser){
            console.log('Receives new users', message.data)
            const user = message.data
            
            //Store new user info in UserOnline object for easy access
            //The userOnline object stores all users currently connected
            //on network, not just those who are connected to this node
            this.usersOnline[user.userName] = {
                userName:user.userName,
                socketID:user.socketID
            }

            //Push the new state to connected users
            this.broadcastToUsers('usersOnline', this.usersOnline)
        }
        else if(message.data.userDisconnected){
            //retrieve user details from message data
            const disconnectedUser = message.data
            //remove user from active users
            this.usersOnline[disconnectedUser.userName] = {}
            delete this.usersOnline[disconnectedUser.userName]
            //Push the new state to connected users
            this.broadcastToUsers('usersOnline', this.usersOnline)

        }
    }

    sendNetworkMessage(data, config){
        //Create a unique ID for every message
        const messageID = sha1(Math.random())
        //If message hasn't already been received, check it
        if(!this.networkMessages[messageID]){
            //Message is composed of data and configuration parameters
            const message = { ...data, ...config }
            //Send it to all immediate peer nodes, 
            //who will in turn relay it to other remote peer
            this.transmitter.broadcast(message)
            //Store message to avoid infinite feedback
            this.networkMessages[messageID] = message;
        }
        return 'Okay'
    }

    /**
     * Broadcasts a message from the network only to user endpoints
     * @param {*} message 
     * @param {string} from 
     * @returns 
     */
    broadcastToUsers(type, message, from){
        for(const id of Object.keys(this.userSockets)){
            if(from !== id){
                const userSocket = this.userSockets[id]
                userSocket.emit(type, message)
            }else{
                //'Will not send back message to origin user'
            }
        }
    }

    /**
     * Outputs message sent
     * @param {*} message 
     */
    receiveMessage(message){
        log(`|Server| ${message}`)
    }

    stop(){
        this.disconnectSockets();
        this.close()
        this.transmitter.close()
        this.discovery.close()
    }

}

export default Receiver;