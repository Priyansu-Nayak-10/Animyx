const webpush = require('web-push');
const crypto = require('crypto');

async function main() {
    const vapid = webpush.generateVAPIDKeys();
    const jwtSecret = crypto.randomBytes(32).toString('base64');
    
    console.log('--- VAPID KEYS ---');
    console.log('Public:', vapid.publicKey);
    console.log('Private:', vapid.privateKey);
    console.log('\n--- JWT SECRET ---');
    console.log(jwtSecret);
}

main().catch(console.error);
