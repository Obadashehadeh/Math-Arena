const http = require('http');

const options = {
    hostname: 'localhost',
    port: process.env.PORT || process.env.ORCHESTRATOR_PORT || process.env.AUTH_SERVICE_PORT || process.env.GAME_SERVICE_PORT || process.env.PLAYERS_SERVICE_PORT || 3000,
    path: '/health',
    method: 'GET',
    timeout: 2000
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const response = JSON.parse(data);
                if (response.status === 'healthy') {
                    console.log('Health check passed');
                    process.exit(0);
                } else {
                    console.log('Health check failed: unhealthy status');
                    process.exit(1);
                }
            } catch (error) {
                console.log('Health check failed: invalid response format');
                process.exit(1);
            }
        } else {
            console.log(`Health check failed: HTTP ${res.statusCode}`);
            process.exit(1);
        }
    });
});

req.on('error', (error) => {
    console.log(`Health check failed: ${error.message}`);
    process.exit(1);
});

req.on('timeout', () => {
    console.log('Health check failed: timeout');
    req.destroy();
    process.exit(1);
});

req.end();