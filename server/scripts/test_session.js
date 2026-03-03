const axios = require('axios');

const BASE_URL = 'http://localhost:3009/api/agent';
const SESSION_ID = 'test-session-' + Date.now();

async function testPersistence() {
    console.log(`Testing with Session ID: ${SESSION_ID}`);

    try {
        // 1. Send first message
        console.log('\n--- Step 1: Sending first message ---');
        const res1 = await axios.post(`${BASE_URL}/run`, {
            messages: [{ role: 'user', content: 'Say "Hello, I am the test agent."' }],
            sessionId: SESSION_ID,
            fastMode: true
        }, { responseType: 'stream' });

        await new Promise((resolve, reject) => {
            res1.data.on('data', chunk => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    const content = line.trim().replace('data: ', '');
                    if (!content) continue;
                    try {
                        const payload = JSON.parse(content);
                        if (payload.type === 'response') console.log('Agent Response:', payload.content);
                        if (payload.type === 'error') {
                            console.error('Agent Error Payload:', payload.message);
                            reject(new Error(payload.message));
                        }
                        if (payload.type === 'done') resolve();
                    } catch (e) {
                        // Ignore non-json or partial lines
                    }
                }
            });
            res1.data.on('error', reject);
        });

        // 2. Clear Session
        console.log('\n--- Step 2: Clearing session ---');
        const res2 = await axios.post(`${BASE_URL}/clear`, { sessionId: SESSION_ID });
        console.log('Clear Response:', res2.data);

        if (res2.data.success) {
            console.log('\n✅ Persistence test completed successfully (Session Cleared).');
        } else {
            console.error('\n❌ Persistence test failed.');
        }

    } catch (err) {
        console.error('Test failed:', err.message);
    }
}

testPersistence();
