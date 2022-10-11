import { Server } from "socket.io";
import EventEmitter from "events";
import { log, errlog } from './utils.js';
import Discovery from "./discovery.js";
import Transmitter from "./transmitter.js";
import isIP from 'is-ip'
import { io } from "socket.io-client";
import UserEndpoint from './UserEndpoint.js'
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
        this.endpoint = new UserEndpoint({
            transmitter:this.transmitter,
            address:this.address,
            peersConnected:this.peersConnected
        })
        
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

        // this.announce()
    }

    newUser(socket){
        this.userSockets[socket.id] = socket
        socket.on('message', (message)=>{
            const userSocketIDs = Object.keys(this.userSockets)
            message.isUserMessage = true;
            for(let id of userSocketIDs){
                const user = this.userSockets[id]
                // console.log('Sending')
                // console.log(message)
                user.emit('messageResponse', message)
            }
            console.log(`${this.address} sending ${message.text}`)
            this.transmitter.broadcast(message)
            
        })
        socket.on('newUser', (data) => {
            //Adds the new user to the list of users
            this.activeUsers.push(data);
            
            //Sends the list of users to the client
            this.emit('newUserResponse', this.activeUsers);
            // const message = { activeUsers:this.activeUsers, isNewUser:true }
            const message = { ...data, isNewUser:true }
            console.log('New User', message)
            this.transmitter.broadcast(message)
        });
        socket.on('disconnect', () => {
            //Updates the list of users when a user disconnects from the server
            let userWhoDisconnected = {
                userName:'',
                socketID:''
            }

            this.activeUsers = this.activeUsers.filter((user) => {
                if(user.socketID === socket.id){
                    userWhoDisconnected = user
                    console.log('He went away', userWhoDisconnected)
                }
                user.socketID !== socket.id
            });
            console.log('🔥: A user disconnected');
            this.emit('newUserResponse', this.activeUsers);
            userWhoDisconnected.userDisconnected = true;
            this.transmitter.broadcast(userWhoDisconnected)
        });
        socket.on("connect_error", (err) => {
            console.log(`connect_error due to ${err.message}`);
        });

        socket.emit('activeUsersRequest')
    }

    handleNewConnection(socket, address){
        if(!this.peersConnected[address]){
            this.peersConnected[address] = socket;
            socket.peerAddress = address;
            log(`|Server| Peer ${address} connected`)
            this.transmitter.connect({ address:address })
            socket.on('message', message => this.receiveMessage(message))
        }
    }

    handleNetworkMessage(message){
        const messageID = message.messageID
        if(!this.networkMessages[messageID]){
            const result = this.transmitter.relay(message)
            this.networkMessages[messageID] = message

            this.handleNetworkMessageType(message)
        }else{
            //message already known
        }
    }

    handleNetworkMessageType(message){
        console.log('Relayed message', message)
        if(message.data.isUserMessage){
            const userMessage = message.data
            this.broadcastToUsers('messageResponse', userMessage, userMessage.socketID)
        }
        else if(message.data.isNewUser){
            console.log('Receives new users')
            this.activeUsers.push({ userName:message.data.userName, socketID:message.data.socketID })
            this.broadcastToUsers('newUserResponse', this.activeUsers);
        }
        else if(message.data.userDisconnected){
            
            // // console.log('Remote user disconnected')
            // const disconnectedUser = message.data
            // const currentUsers = this.activeUsers.filter((user)=>{
            //     console.log('User',user)
            //     console.log('Disco', disconnectedUser)
            //     return user.socketID !== disconnectedUser.socketID
            // })

            // if(currentUsers.length > 0){
            //     this.activeUsers = currentUsers
            // }


        }
    }

    sendNetworkMessage(data, config){
        const messageID = sha1(Math.random())
        if(!this.networkMessages[messageID]){
            const message = { ...data, ...config }
            this.transmitter.broadcast(message)
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
                console.log(`${this.address} showing ${message.text}`)
                console.log(`${this.address} connection is alive ${userSocket.connected}`)
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