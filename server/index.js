import 'dotenv/config';
import { createApp } from './app.js';
import { createGateway } from './gateway.js';
const gateway=createGateway();
const app=createApp({gateway});
const port=Number(process.env.PORT||4000);
const server=app.listen(port,process.env.HOST||'127.0.0.1',(error)=>{
 if(error){console.error(JSON.stringify({event:'startup_error',port,code:error.code||'LISTEN_FAILED'}));process.exitCode=1;return;}
 console.log(JSON.stringify({event:'listening',port}));
});
server.requestTimeout=30000;
server.headersTimeout=15000;
server.keepAliveTimeout=5000;
server.setTimeout(35000,socket=>socket.destroy());
let shuttingDown=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 if(shuttingDown)return;shuttingDown=true;
 console.log(JSON.stringify({event:'shutdown',signal}));
 server.close(()=>process.exit(0));server.closeIdleConnections();
 setTimeout(()=>{server.closeAllConnections();process.exit(1);},10000).unref();
});
