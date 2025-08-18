const dgram = require('dgram');

/**
 * 简单UDP客户端，用于向指定主机和端口发送数据
 */
class SimpleUDPClient {
    /**
     * 创建UDP客户端
     * @param {string} host - 目标主机地址
     * @param {number} port - 目标端口
     */
    constructor(host = 'localhost', port = 8080) {
        this.host = host;
        this.port = port;
        this.socket = dgram.createSocket('udp4');
    }

    /**
     * 发送数据
     * @param {string|Buffer|Object} data - 要发送的数据
     * @returns {Promise} 发送结果的Promise
     */
    send(data) {
        return new Promise((resolve, reject) => {
            let message;
            
            if (Buffer.isBuffer(data)) {
                message = data;
            } else if (typeof data === 'object') {
                message = Buffer.from(JSON.stringify(data));
            } else {
                message = Buffer.from(String(data));
            }

            this.socket.send(message, this.port, this.host, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 关闭UDP socket
     */
    close() {
        this.socket.close();
    }
}

// 使用示例
async function example() {
    // 创建客户端实例
    const client = new SimpleUDPClient('localhost', 20003);
    
    try {
        // 发送字符串
        await client.send('Hello UDP Server!');
        console.log('已发送字符串消息');
        
        // 发送对象（会自动转换为JSON）
        await client.send({type: 'test', value: 123});
        console.log('已发送对象消息');
        
        // 发送Buffer
        await client.send(Buffer.from('Direct buffer data'));
        console.log('已发送Buffer消息');
        
    } catch (err) {
        console.error('发送失败:', err);
    } finally {
        // 关闭连接
        client.close();
    }
}

// 如果直接运行此脚本，则执行示例
if (require.main === module) {
    // example();
}


const client = new SimpleUDPClient('127.0.0.1', 20003);
let i=0;
function sendExp(){
    i++;
    setTimeout(() => {
        client.send('Hello from UDP client:::'+i);
        sendExp();
    }, 2000);
}
sendExp();