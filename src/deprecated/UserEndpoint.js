
export default class UserEndpoint{
    constructor({ address, peersConnected, transmitter,  }){
        this.address = address;
        this.peersConnected = peersConnected || {}
        this.transmitter = transmitter
        this.userSockets = {}
        
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
    }

    /**
     * Broadcasts a message from the network only to user endpoints
     * @param {*} message 
     * @param {string} from 
     * @returns 
     */
         broadcastToUsers(message, from){
            for(const id of Object.keys(this.userSockets)){
                console.log(message)
                if(from !== id){
                    const userSocket = this.userSockets[id]
                    console.log(`${this.address} showing ${message.text}`)
                    userSocket.emit('messageResponse', { message:message })
                    return 'okay'
                }else{
                    //'Will not send back message to origin user'
                }
            }
            
            return 'no users connected'
        }
}