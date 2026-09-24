import crypto from 'node:crypto';

const jwt = crypto.randomBytes(48).toString('base64url');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
const publicDer = publicKey.export({ format: 'der', type: 'spki' });
const privateRaw = privateDer.subarray(privateDer.length - 32).toString('base64');
const publicRaw = publicDer.subarray(publicDer.length - 32).toString('base64');

console.log('# Copy these values into your local .env. Do not commit or publish them.');
console.log(`JWT_SECRET=${jwt}`);
console.log(`ED25519_PRIVATE_KEY=${privateRaw}`);
console.log(`ED25519_PUBLIC_KEY=${publicRaw}`);
