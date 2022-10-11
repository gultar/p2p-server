export const log = (...message) =>{
    const date = new Date()
    const time = `${date.getHours() }:${date.getMinutes()}:${date.getSeconds()}`
    console.log(`[${time}]: ${message}`)
}

export const errlog = (...message) =>{
    if(global.ERRLOG == true){
        const time = new Date().getHours()
        if(typeof message == 'object'){
            message = JSON.stringify(message, null, 2)
        }
        console.error(`DEBUG > [${time}]: ${message}`)
    }
}

export const isEmpty = (obj) => Object.keys(obj).length === 0 



